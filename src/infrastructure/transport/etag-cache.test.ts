import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../domain/errors.js";
import type {
  CacheStore,
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../domain/ports.js";
import { EtagCache } from "./etag-cache.js";
import { MapCacheStore } from "./map-cache-store.js";

const URL = "https://api.chess.com/pub/player/hikaru";
const REQ: HttpRequest = { url: URL };

function response(over: Partial<HttpResponse> = {}): HttpResponse {
  return { status: 200, etag: undefined, body: { v: 1 }, ...over };
}

/** Inner transport that records the requests it saw and replays scripted responses. */
function transportOf(
  handler: (req: HttpRequest, n: number) => Promise<HttpResponse>,
): { transport: HttpTransport; seen: HttpRequest[] } {
  const seen: HttpRequest[] = [];
  let n = 0;
  return {
    transport: {
      request: (req) => {
        seen.push(req);
        return handler(req, ++n);
      },
    },
    seen,
  };
}

describe("EtagCache", () => {
  it("does not send If-None-Match on a cache miss, and stores the ETag", async () => {
    const store = new MapCacheStore();
    const { transport, seen } = transportOf(() =>
      Promise.resolve(response({ etag: '"v1"', body: { name: "hikaru" } })),
    );
    const cache = new EtagCache(transport, store);

    const res = await cache.request(REQ);

    expect(seen[0]?.etag).toBeUndefined();
    expect(res.body).toEqual({ name: "hikaru" });
    await expect(store.get(URL)).resolves.toEqual({
      etag: '"v1"',
      body: { name: "hikaru" },
    });
  });

  it("revalidates with If-None-Match and serves the cached body on 304", async () => {
    const store = new MapCacheStore();
    await store.set(URL, { etag: '"v1"', body: { name: "hikaru" } });
    const { transport, seen } = transportOf(() =>
      Promise.resolve(
        response({ status: 304, etag: undefined, body: undefined }),
      ),
    );
    const cache = new EtagCache(transport, store);

    const res = await cache.request(REQ);

    expect(seen[0]?.etag).toBe('"v1"');
    expect(res.status).toBe(304);
    expect(res.body).toEqual({ name: "hikaru" });
  });

  it("updates the cache when the resource changed (200 with a new ETag)", async () => {
    const store = new MapCacheStore();
    await store.set(URL, { etag: '"v1"', body: { name: "old" } });
    const { transport } = transportOf(() =>
      Promise.resolve(response({ etag: '"v2"', body: { name: "new" } })),
    );
    const cache = new EtagCache(transport, store);

    const res = await cache.request(REQ);

    expect(res.body).toEqual({ name: "new" });
    await expect(store.get(URL)).resolves.toEqual({
      etag: '"v2"',
      body: { name: "new" },
    });
  });

  it("passes through and stores nothing when the response has no ETag", async () => {
    const store = new MapCacheStore();
    const { transport } = transportOf(() =>
      Promise.resolve(response({ etag: undefined, body: { name: "hikaru" } })),
    );
    const cache = new EtagCache(transport, store);

    const res = await cache.request(REQ);

    expect(res.body).toEqual({ name: "hikaru" });
    await expect(store.get(URL)).resolves.toBeUndefined();
  });

  it("propagates inner errors and caches nothing", async () => {
    const store = new MapCacheStore();
    const { transport } = transportOf(() =>
      Promise.reject(new NotFoundError("404", { url: URL, status: 404 })),
    );
    const cache = new EtagCache(transport, store);

    await expect(cache.request(REQ)).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.get(URL)).resolves.toBeUndefined();
  });

  it("degrades to a miss when the store read fails", async () => {
    const store: CacheStore = {
      get: () => Promise.reject(new Error("cache down")),
      set: () => Promise.resolve(),
    };
    const { transport, seen } = transportOf(() =>
      Promise.resolve(response({ etag: '"v1"', body: { name: "hikaru" } })),
    );
    const cache = new EtagCache(transport, store);

    const res = await cache.request(REQ);

    expect(seen[0]?.etag).toBeUndefined(); // no usable cache -> plain request
    expect(res.body).toEqual({ name: "hikaru" });
  });

  it("does not fail the request when the store write fails", async () => {
    const store: CacheStore = {
      get: () => Promise.resolve(undefined),
      set: () => Promise.reject(new Error("cache down")),
    };
    const { transport } = transportOf(() =>
      Promise.resolve(response({ etag: '"v1"', body: { name: "hikaru" } })),
    );
    const cache = new EtagCache(transport, store);

    await expect(cache.request(REQ)).resolves.toMatchObject({
      body: { name: "hikaru" },
    });
  });
});

describe("MapCacheStore", () => {
  it("round-trips an entry and returns undefined for a miss", async () => {
    const store = new MapCacheStore();

    await expect(store.get("missing")).resolves.toBeUndefined();
    await store.set("k", { etag: '"e"', body: { a: 1 } });
    await expect(store.get("k")).resolves.toEqual({
      etag: '"e"',
      body: { a: 1 },
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  ServerError,
} from "../../domain/errors.js";
import { FetchTransport } from "./fetch-transport.js";

const URL = "https://api.chess.com/pub/player/hikaru";

/** Records each call and returns whatever the handler produces. */
function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function headersOf(init?: RequestInit): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

describe("FetchTransport", () => {
  it("sends User-Agent and Accept, and returns the parsed body on 200", async () => {
    const { fn, calls } = mockFetch(
      () =>
        new Response(JSON.stringify({ username: "hikaru" }), {
          status: 200,
          headers: { etag: '"v1"' },
        }),
    );
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    const res = await transport.request({ url: URL });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "hikaru" });
    expect(res.etag).toBe('"v1"');
    expect(headersOf(calls[0]?.init)["User-Agent"]).toBe("test/1.0");
    expect(headersOf(calls[0]?.init).Accept).toBe("application/json");
  });

  it("sends If-None-Match and returns an empty body on 304", async () => {
    const { fn, calls } = mockFetch(() => new Response(null, { status: 304 }));
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    const res = await transport.request({ url: URL, etag: '"v1"' });

    expect(res.status).toBe(304);
    expect(res.body).toBeUndefined();
    expect(res.etag).toBe('"v1"');
    expect(headersOf(calls[0]?.init)["If-None-Match"]).toBe('"v1"');
  });

  it("maps 404 to NotFoundError", async () => {
    const { fn } = mockFetch(() => new Response("", { status: 404 }));
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    await expect(transport.request({ url: URL })).rejects.toMatchObject({
      kind: "not_found",
      status: 404,
    });
    await expect(transport.request({ url: URL })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("maps 403 to ForbiddenError", async () => {
    const { fn } = mockFetch(() => new Response("", { status: 403 }));
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    await expect(transport.request({ url: URL })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("maps 429 to RateLimitError and parses Retry-After (seconds)", async () => {
    const { fn } = mockFetch(
      () => new Response("", { status: 429, headers: { "retry-after": "5" } }),
    );
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    await expect(transport.request({ url: URL })).rejects.toMatchObject({
      kind: "rate_limit",
      status: 429,
      retryAfterMs: 5000,
    });
  });

  it("maps 5xx to ServerError", async () => {
    const { fn } = mockFetch(() => new Response("", { status: 503 }));
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    await expect(transport.request({ url: URL })).rejects.toBeInstanceOf(
      ServerError,
    );
  });

  it("wraps a fetch failure in NetworkError, preserving the cause", async () => {
    const boom = new Error("connection refused");
    const fn = vi.fn(() => Promise.reject(boom)) as unknown as typeof fetch;
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    const err = await transport.request({ url: URL }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).cause).toBe(boom);
    expect((err as NetworkError).status).toBeUndefined();
  });

  it("propagates a caller-initiated abort untouched", async () => {
    const controller = new AbortController();
    controller.abort();
    const abortError = new DOMException("aborted", "AbortError");
    const fn = vi.fn(() =>
      Promise.reject(abortError),
    ) as unknown as typeof fetch;
    const transport = new FetchTransport({ userAgent: "test/1.0", fetch: fn });

    await expect(
      transport.request({ url: URL, signal: controller.signal }),
    ).rejects.toBe(abortError);
  });

  it("falls back to the global fetch when none is provided", () => {
    // Node 18+ provides a global fetch, so construction succeeds without one.
    expect(() => new FetchTransport({ userAgent: "test/1.0" })).not.toThrow();
  });
});

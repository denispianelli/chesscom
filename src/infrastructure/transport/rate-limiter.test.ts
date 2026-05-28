import { describe, expect, it, vi } from "vitest";
import { NotFoundError, RateLimitError } from "../../domain/errors.js";
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../domain/ports.js";
import { RateLimiter } from "./rate-limiter.js";

const REQ: HttpRequest = { url: "https://api.chess.com/pub/player/hikaru" };
const OK: HttpResponse = { status: 200, etag: undefined, body: { ok: true } };

/** A sleep that resolves instantly but records the delays it was asked for. */
function recordingSleep() {
  const delays: number[] = [];
  return {
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
    delays,
  };
}

/** A one-shot barrier: tasks await `promise`, the test calls `open()` to release. */
function makeGate(): { promise: Promise<void>; open: () => void } {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Inner transport driven by a per-call handler. */
function transportOf(
  handler: (callNumber: number) => Promise<HttpResponse>,
): { transport: HttpTransport; calls: () => number } {
  let n = 0;
  return {
    transport: { request: () => handler(++n) },
    calls: () => n,
  };
}

describe("RateLimiter", () => {
  it("serializes requests when concurrency is 1", async () => {
    const gate = makeGate();
    let active = 0;
    let peak = 0;
    const inner: HttpTransport = {
      async request() {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
        return OK;
      },
    };
    const limiter = new RateLimiter(inner, { concurrency: 1 });

    const all = Promise.all([
      limiter.request(REQ),
      limiter.request(REQ),
      limiter.request(REQ),
    ]);
    await Promise.resolve();
    gate.open();
    await all;

    expect(peak).toBe(1);
  });

  it("allows up to `concurrency` requests in flight", async () => {
    const gate = makeGate();
    let active = 0;
    let peak = 0;
    const inner: HttpTransport = {
      async request() {
        active += 1;
        peak = Math.max(peak, active);
        await gate.promise;
        active -= 1;
        return OK;
      },
    };
    const limiter = new RateLimiter(inner, { concurrency: 2 });

    const all = Promise.all([
      limiter.request(REQ),
      limiter.request(REQ),
      limiter.request(REQ),
    ]);
    await Promise.resolve();
    gate.open();
    await all;

    expect(peak).toBe(2);
  });

  it("retries after a 429 and returns the eventual success", async () => {
    const { transport, calls } = transportOf((n) =>
      n === 1
        ? Promise.reject(new RateLimitError("429", { url: REQ.url, status: 429 }))
        : Promise.resolve(OK),
    );
    const { sleep } = recordingSleep();
    const limiter = new RateLimiter(transport, { sleep });

    await expect(limiter.request(REQ)).resolves.toBe(OK);
    expect(calls()).toBe(2);
  });

  it("honors Retry-After over computed backoff", async () => {
    const { transport } = transportOf((n) =>
      n === 1
        ? Promise.reject(
            new RateLimitError("429", {
              url: REQ.url,
              status: 429,
              retryAfterMs: 5000,
            }),
          )
        : Promise.resolve(OK),
    );
    const { sleep, delays } = recordingSleep();
    const limiter = new RateLimiter(transport, { sleep });

    await limiter.request(REQ);

    expect(delays).toEqual([5000]);
  });

  it("uses exponential backoff with full jitter when no Retry-After", async () => {
    const { transport } = transportOf((n) =>
      n <= 2
        ? Promise.reject(new RateLimitError("429", { url: REQ.url, status: 429 }))
        : Promise.resolve(OK),
    );
    const { sleep, delays } = recordingSleep();
    const limiter = new RateLimiter(transport, {
      sleep,
      random: () => 1, // full jitter at its ceiling, for determinism
      baseDelayMs: 1000,
    });

    await limiter.request(REQ);

    // attempt 0 -> 1000 * 2^0, attempt 1 -> 1000 * 2^1
    expect(delays).toEqual([1000, 2000]);
  });

  it("gives up after maxRetries and rethrows the RateLimitError", async () => {
    const { transport, calls } = transportOf(() =>
      Promise.reject(new RateLimitError("429", { url: REQ.url, status: 429 })),
    );
    const { sleep } = recordingSleep();
    const limiter = new RateLimiter(transport, { sleep, maxRetries: 2 });

    await expect(limiter.request(REQ)).rejects.toBeInstanceOf(RateLimitError);
    expect(calls()).toBe(3); // initial + 2 retries
  });

  it("calls onRateLimit for every 429, flagging the final give-up", async () => {
    const { transport } = transportOf(() =>
      Promise.reject(new RateLimitError("429", { url: REQ.url, status: 429 })),
    );
    const { sleep } = recordingSleep();
    const onRateLimit = vi.fn();
    const limiter = new RateLimiter(transport, {
      sleep,
      maxRetries: 2,
      onRateLimit,
    });

    await expect(limiter.request(REQ)).rejects.toBeInstanceOf(RateLimitError);
    expect(onRateLimit).toHaveBeenCalledTimes(3);
    expect(onRateLimit.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      willRetry: true,
    });
    expect(onRateLimit.mock.calls[2]?.[0]).toMatchObject({
      attempt: 3,
      willRetry: false,
    });
  });

  it("does not retry non-rate-limit errors", async () => {
    const { transport, calls } = transportOf(() =>
      Promise.reject(new NotFoundError("404", { url: REQ.url, status: 404 })),
    );
    const limiter = new RateLimiter(transport);

    await expect(limiter.request(REQ)).rejects.toBeInstanceOf(NotFoundError);
    expect(calls()).toBe(1);
  });

  it("rejects an invalid concurrency", () => {
    const { transport } = transportOf(() => Promise.resolve(OK));
    expect(() => new RateLimiter(transport, { concurrency: 0 })).toThrow(
      RangeError,
    );
  });
});

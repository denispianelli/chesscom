import { RateLimitError } from "../../domain/errors.js";
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../domain/ports.js";

/** Details of a single rate-limit event, passed to {@link RateLimiterConfig.onRateLimit}. */
export interface RateLimitInfo {
  /** URL of the request that was rate limited. */
  readonly url: string;
  /** 1-based attempt number that received the 429. */
  readonly attempt: number;
  /** `Retry-After` advised by the server, in ms, if any. */
  readonly retryAfterMs: number | undefined;
  /** How long we will wait before the next attempt, in ms (`0` if giving up). */
  readonly delayMs: number;
  /** Whether another attempt will be made. */
  readonly willRetry: boolean;
}

/** Configuration for {@link RateLimiter}. */
export interface RateLimiterConfig {
  /** Maximum requests in flight at once. Default `1` (fully serial). */
  readonly concurrency?: number;
  /** Maximum retries after a 429 before giving up. Default `3`. */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff, in ms. Default `1000`. */
  readonly baseDelayMs?: number;
  /** Upper bound on a single backoff delay, in ms. Default `30000`. */
  readonly maxDelayMs?: number;
  /** Observability hook, invoked on every 429 (including the final give-up). */
  readonly onRateLimit?: (info: RateLimitInfo) => void;
  /** Sleep implementation. Injected in tests to avoid real timers. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Source of randomness for jitter, in `[0, 1)`. Injected in tests. */
  readonly random?: () => number;
}

/**
 * Decorates an {@link HttpTransport} with the politeness the Chess.com API
 * expects: requests are funneled through a concurrency-limited queue (serial by
 * default), and a `429` triggers exponential backoff with full jitter, honoring
 * the server's `Retry-After` when present. The backoff is awaited while holding
 * the queue slot, so a rate-limited request never lets others race past it.
 */
export class RateLimiter implements HttpTransport {
  readonly #inner: HttpTransport;
  readonly #queue: Semaphore;
  readonly #maxRetries: number;
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #onRateLimit: ((info: RateLimitInfo) => void) | undefined;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #random: () => number;

  constructor(inner: HttpTransport, config: RateLimiterConfig = {}) {
    const concurrency = config.concurrency ?? 1;
    if (concurrency < 1) {
      throw new RangeError(
        `concurrency must be >= 1, got ${String(concurrency)}`,
      );
    }
    this.#inner = inner;
    this.#queue = new Semaphore(concurrency);
    this.#maxRetries = config.maxRetries ?? 3;
    this.#baseDelayMs = config.baseDelayMs ?? 1000;
    this.#maxDelayMs = config.maxDelayMs ?? 30000;
    this.#onRateLimit = config.onRateLimit;
    this.#sleep = config.sleep ?? defaultSleep;
    this.#random = config.random ?? Math.random;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    return this.#queue.run(() => this.#attempt(req, 0));
  }

  /** Issue the request, retrying on 429 with backoff until retries run out. */
  async #attempt(req: HttpRequest, attempt: number): Promise<HttpResponse> {
    try {
      return await this.#inner.request(req);
    } catch (err) {
      if (!(err instanceof RateLimitError)) {
        throw err;
      }
      const willRetry = attempt < this.#maxRetries;
      const delayMs = willRetry
        ? this.#computeDelay(attempt, err.retryAfterMs)
        : 0;
      this.#onRateLimit?.({
        url: req.url,
        attempt: attempt + 1,
        retryAfterMs: err.retryAfterMs,
        delayMs,
        willRetry,
      });
      if (!willRetry) {
        throw err;
      }
      await this.#sleep(delayMs);
      return this.#attempt(req, attempt + 1);
    }
  }

  /**
   * Backoff delay for a given attempt. Honors the server's `Retry-After`; else
   * uses full jitter — a random point in `[0, base * 2^attempt]`, capped.
   */
  #computeDelay(attempt: number, retryAfterMs: number | undefined): number {
    if (retryAfterMs !== undefined) {
      return retryAfterMs;
    }
    const ceiling = Math.min(
      this.#maxDelayMs,
      this.#baseDelayMs * 2 ** attempt,
    );
    return Math.round(ceiling * this.#random());
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A counting semaphore: caps the number of tasks running concurrently. With a
 * capacity of 1 it serializes everything. When a slot frees, it is handed
 * directly to the next waiter (FIFO), preserving request order.
 */
class Semaphore {
  readonly #capacity: number;
  #active = 0;
  readonly #waiters: (() => void)[] = [];

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.#acquire();
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  #acquire(): Promise<void> {
    if (this.#active < this.#capacity) {
      this.#active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  #release(): void {
    const next = this.#waiters.shift();
    if (next === undefined) {
      this.#active -= 1;
    } else {
      // Hand the slot straight to the next waiter; #active stays unchanged.
      next();
    }
  }
}

import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ServerError,
  type ChessComError,
} from "../../domain/errors.js";
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../../domain/ports.js";

/** Configuration for {@link FetchTransport}. */
export interface FetchTransportConfig {
  /**
   * Value sent as the `User-Agent` header. Required by the Chess.com API
   * (requests without a descriptive User-Agent are rejected with 403).
   */
  readonly userAgent: string;
  /** `fetch` implementation. Defaults to the global `fetch`. Injected in tests. */
  readonly fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. No timeout when omitted. */
  readonly timeoutMs?: number;
}

/**
 * The leaf HTTP adapter: performs one `fetch` per request, forces the required
 * headers, and maps non-OK statuses to typed {@link ChessComError}s. It holds no
 * caching or rate-limiting logic — those are separate decorators that wrap it.
 */
export class FetchTransport implements HttpTransport {
  readonly #userAgent: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number | undefined;

  constructor(config: FetchTransportConfig) {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new TypeError(
        "No `fetch` available. Pass `fetch` explicitly or run on a platform that provides it (Node 18+, Deno, Bun, browsers).",
      );
    }
    this.#userAgent = config.userAgent;
    this.#fetch = fetchImpl;
    this.#timeoutMs = config.timeoutMs;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const headers: Record<string, string> = {
      "User-Agent": this.#userAgent,
      Accept: "application/json",
    };
    if (req.etag !== undefined) {
      headers["If-None-Match"] = req.etag;
    }

    const signal = this.#resolveSignal(req.signal);

    let response: Response;
    try {
      response = await this.#fetch(req.url, { headers, signal: signal ?? null });
    } catch (cause) {
      // A caller-initiated abort is propagated untouched so it stays
      // distinguishable from our own failures.
      if (req.signal?.aborted === true) {
        throw cause;
      }
      const timedOut = signal?.aborted === true;
      throw new NetworkError(
        timedOut
          ? `Request to ${req.url} timed out`
          : `Request to ${req.url} failed`,
        { url: req.url, cause },
      );
    }

    if (response.status === 304) {
      return { status: 304, etag: req.etag, body: undefined };
    }
    if (!response.ok) {
      throw this.#toError(response, req.url);
    }

    const body: unknown = await response.json();
    return {
      status: response.status,
      etag: response.headers.get("etag") ?? undefined,
      body,
    };
  }

  /** Combine the caller's signal with an optional timeout signal. */
  #resolveSignal(userSignal?: AbortSignal): AbortSignal | undefined {
    const signals: AbortSignal[] = [];
    if (userSignal !== undefined) {
      signals.push(userSignal);
    }
    if (this.#timeoutMs !== undefined) {
      signals.push(AbortSignal.timeout(this.#timeoutMs));
    }
    if (signals.length === 0) return undefined;
    if (signals.length === 1) return signals[0];
    return AbortSignal.any(signals);
  }

  /** Map a non-OK response to the matching typed error. */
  #toError(response: Response, url: string): ChessComError {
    const status = response.status;
    switch (status) {
      case 403:
        return new ForbiddenError(
          `Forbidden (403) for ${url}. Is a valid User-Agent set?`,
          { url, status },
        );
      case 404:
      case 410:
        return new NotFoundError(`Not found (${String(status)}) for ${url}`, {
          url,
          status,
        });
      case 429: {
        const retryAfterMs = parseRetryAfterMs(
          response.headers.get("retry-after"),
        );
        return new RateLimitError(`Rate limited (429) for ${url}`, {
          url,
          status,
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        });
      }
      default:
        return new ServerError(
          `Unexpected response (${String(status)}) for ${url}`,
          { url, status },
        );
    }
  }
}

/**
 * Parse a `Retry-After` header into milliseconds. Supports both the delay form
 * (seconds) and the HTTP-date form. Returns `undefined` when unparseable.
 */
function parseRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, dateMs - Date.now());
}

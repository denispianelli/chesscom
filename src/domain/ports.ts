/**
 * Ports: the abstractions the core depends on. Infrastructure adapters
 * (FetchTransport, EtagCache, …) implement these; the core never imports a
 * concrete implementation. This is what keeps fetch and zod replaceable details.
 */

/** A single HTTP request, as seen by the transport layer. */
export interface HttpRequest {
  /** Absolute URL to fetch. */
  readonly url: string;
  /**
   * ETag of a previously cached response. When set, the transport issues a
   * conditional request (`If-None-Match`) and may receive a `304`.
   */
  readonly etag?: string;
  /** Caller-supplied cancellation signal. */
  readonly signal?: AbortSignal;
}

/** The outcome of a successful (or `304`) HTTP request. */
export interface HttpResponse {
  /** HTTP status code (`200`, `304`, …). */
  readonly status: number;
  /** ETag of the response, used to populate the cache. `undefined` if absent. */
  readonly etag: string | undefined;
  /**
   * Parsed JSON body. `undefined` when the server answered `304 Not Modified`
   * (the caller should reuse its cached body).
   */
  readonly body: unknown;
}

/**
 * Port for performing HTTP requests. Implementations map non-OK statuses to the
 * typed errors in {@link "./errors"} and never resolve with a `>= 400` response.
 * Decorators (rate limiter, cache) wrap a transport and return a transport.
 */
export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/** A cached response: its ETag and the parsed body it validates. */
export interface CacheEntry {
  readonly etag: string;
  readonly body: unknown;
}

/**
 * Port for ETag-based response caching. The default implementation is an
 * in-memory `Map`; consumers can plug in Redis, the filesystem, etc.
 */
export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry): Promise<void>;
}

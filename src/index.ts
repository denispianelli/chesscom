/**
 * `@dpianelli/chesscom` — Unofficial TypeScript SDK for the Chess.com
 * Published-Data API.
 *
 * Public surface is assembled here. The high-level client lands next;
 * see SPEC.md for the target API.
 */

export {
  ChessComError,
  NotFoundError,
  ForbiddenError,
  RateLimitError,
  ServerError,
  ValidationError,
  NetworkError,
  type ChessComErrorKind,
} from "./domain/errors.js";

export type {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  CacheStore,
  CacheEntry,
} from "./domain/ports.js";

export {
  FetchTransport,
  type FetchTransportConfig,
} from "./infrastructure/transport/fetch-transport.js";

export {
  RateLimiter,
  type RateLimiterConfig,
  type RateLimitInfo,
} from "./infrastructure/transport/rate-limiter.js";

export { EtagCache } from "./infrastructure/transport/etag-cache.js";
export { MapCacheStore } from "./infrastructure/transport/map-cache-store.js";

/** Package version, kept in sync with package.json at release time. */
export const VERSION = "0.0.0";

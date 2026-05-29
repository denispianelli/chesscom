/**
 * `@dpianelli/chesscom` — Unofficial TypeScript SDK for the Chess.com
 * Published-Data API.
 *
 * Public surface is assembled here. The high-level client lands next;
 * see SPEC.md for the target API.
 */

export {
  ChessComClient,
  type ChessComClientOptions,
  type RequestOptions,
  type StreamGamesOptions,
  type ValidationErrorMode,
} from "./client.js";

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

export type {
  PlayerProfile,
  PlayerStats,
} from "./infrastructure/schemas/player.js";

export type {
  Game,
  GamePlayer,
  MonthlyGames,
} from "./infrastructure/schemas/game.js";

export type {
  ClubProfile,
  ClubMember,
  ClubMembers,
  PlayerClub,
  PlayerClubs,
} from "./infrastructure/schemas/club.js";

export type {
  Tournament,
  TournamentSettings,
  TournamentPlayer,
  PlayerTournamentEntry,
  PlayerTournaments,
} from "./infrastructure/schemas/tournament.js";

/**
 * Package version. Replaced at build time by tsup's `define` with the value
 * from package.json, so it never drifts from the published version. The `typeof`
 * guard keeps the source runnable without that build step (e.g. under vitest),
 * where the token is undefined — avoiding a `ReferenceError`.
 */
declare const __VERSION__: string | undefined;
export const VERSION: string =
  typeof __VERSION__ === "string" ? __VERSION__ : "0.0.0-dev";

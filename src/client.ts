import type { ZodType } from "zod";
import { ValidationError } from "./domain/errors.js";
import type { CacheStore, HttpTransport } from "./domain/ports.js";
import { FetchTransport } from "./infrastructure/transport/fetch-transport.js";
import { EtagCache } from "./infrastructure/transport/etag-cache.js";
import { MapCacheStore } from "./infrastructure/transport/map-cache-store.js";
import {
  RateLimiter,
  type RateLimitInfo,
} from "./infrastructure/transport/rate-limiter.js";
import {
  playerArchivesSchema,
  playerProfileSchema,
  playerStatsSchema,
  type PlayerArchives,
  type PlayerProfile,
  type PlayerStats,
} from "./infrastructure/schemas/player.js";
import {
  monthlyGamesSchema,
  type Game,
} from "./infrastructure/schemas/game.js";

const DEFAULT_BASE_URL = "https://api.chess.com/pub";

/** How to react when a response does not match its expected schema. */
export type ValidationErrorMode = "throw" | "warn" | "ignore";

/** Options for constructing a {@link ChessComClient}. */
export interface ChessComClientOptions {
  /**
   * Value sent as the `User-Agent` header — **required**. Chess.com rejects
   * requests without a descriptive User-Agent (403). Include an app name and a
   * contact, e.g. `"myapp/1.0 (me@example.com)"`.
   */
  userAgent: string;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Response cache backing the ETag revalidation. Defaults to an in-memory map. */
  cache?: CacheStore;
  /** Per-request timeout in milliseconds. No timeout when omitted. */
  timeout?: number;
  /** API base URL. Defaults to `https://api.chess.com/pub`. */
  baseUrl?: string;
  /** What to do on a schema mismatch. Defaults to `"throw"`. */
  onValidationError?: ValidationErrorMode;
  /** Observability hook, invoked on every 429. */
  onRateLimit?: (info: RateLimitInfo) => void;
}

/** Per-call options. */
export interface RequestOptions {
  /** Cancellation signal for this request. */
  signal?: AbortSignal;
}

/** Options for {@link ChessComClient.streamPlayerGames}. */
export interface StreamGamesOptions extends RequestOptions {
  /** Only months `>=` this `YYYY-MM` (inclusive). */
  since?: string;
  /** Only months `<=` this `YYYY-MM` (inclusive). */
  until?: string;
  /** Iteration order. Defaults to `"newest-first"`. */
  order?: "newest-first" | "oldest-first";
  /** Keep only games of this time class (`bullet`, `blitz`, …). */
  timeClass?: string;
  /** Keep only rated (`true`) or unrated (`false`) games. */
  rated?: boolean;
}

/**
 * The SDK entry point and composition root. Wires the transport chain
 * `RateLimiter( EtagCache( FetchTransport ) )` and exposes the player endpoints,
 * validating every response against its zod schema.
 *
 * @example
 * ```ts
 * const client = new ChessComClient({ userAgent: "myapp/1.0 (me@example.com)" });
 * const profile = await client.getPlayer("hikaru");
 * ```
 */
export class ChessComClient {
  readonly #transport: HttpTransport;
  readonly #baseUrl: string;
  readonly #onValidationError: ValidationErrorMode;

  constructor(options: ChessComClientOptions) {
    if (options.userAgent.trim() === "") {
      throw new TypeError(
        '`userAgent` is required: Chess.com rejects requests without a descriptive User-Agent. Pass e.g. "myapp/1.0 (me@example.com)".',
      );
    }

    const transport = new FetchTransport({
      userAgent: options.userAgent,
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.timeout !== undefined ? { timeoutMs: options.timeout } : {}),
    });
    const cached = new EtagCache(
      transport,
      options.cache ?? new MapCacheStore(),
    );
    this.#transport = new RateLimiter(cached, {
      ...(options.onRateLimit ? { onRateLimit: options.onRateLimit } : {}),
    });

    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#onValidationError = options.onValidationError ?? "throw";
  }

  /** Fetch a player's public profile. */
  getPlayer(
    username: string,
    options?: RequestOptions,
  ): Promise<PlayerProfile> {
    return this.#get(
      `/player/${encodeURIComponent(username)}`,
      playerProfileSchema,
      options,
    );
  }

  /** Fetch a player's rating and game stats. */
  getPlayerStats(
    username: string,
    options?: RequestOptions,
  ): Promise<PlayerStats> {
    return this.#get(
      `/player/${encodeURIComponent(username)}/stats`,
      playerStatsSchema,
      options,
    );
  }

  /** Fetch the list of a player's monthly game-archive URLs. */
  getPlayerArchives(
    username: string,
    options?: RequestOptions,
  ): Promise<PlayerArchives> {
    return this.#get(
      `/player/${encodeURIComponent(username)}/games/archives`,
      playerArchivesSchema,
      options,
    );
  }

  /**
   * Fetch all of a player's games for a given month. `month` is 1-12; the API's
   * zero-padding is handled for you. Returns the games directly (the API's
   * `{ games }` wrapper is unwrapped).
   */
  async getPlayerGames(
    username: string,
    year: number,
    month: number,
    options?: RequestOptions,
  ): Promise<Game[]> {
    const path = `/player/${encodeURIComponent(username)}/games/${monthSegment(year, month)}`;
    const { games } = await this.#get(path, monthlyGamesSchema, options);
    return games;
  }

  /**
   * Lazily iterate over a player's games across monthly archives, hiding the
   * pagination. Fetches one month at a time (so the rate limiter and cache
   * apply per month), yielding game by game. Newest-first by default.
   *
   * @example
   * ```ts
   * for await (const game of client.streamPlayerGames("hikaru", { since: "2024-01" })) {
   *   console.log(game.url);
   * }
   * ```
   */
  async *streamPlayerGames(
    username: string,
    options: StreamGamesOptions = {},
  ): AsyncGenerator<Game> {
    const { since, until, order = "newest-first", timeClass, rated } = options;
    const reqOptions = options.signal ? { signal: options.signal } : undefined;

    const { archives } = await this.getPlayerArchives(username, reqOptions);
    let months = archives
      .map(parseArchiveMonth)
      .filter((m): m is ArchiveMonth => m !== undefined);
    if (since !== undefined) {
      months = months.filter((m) => m.key >= since);
    }
    if (until !== undefined) {
      months = months.filter((m) => m.key <= until);
    }
    if (order === "newest-first") {
      months.reverse();
    }

    for (const month of months) {
      const games = await this.getPlayerGames(
        username,
        month.year,
        month.number,
        reqOptions,
      );
      const ordered = order === "newest-first" ? [...games].reverse() : games;
      for (const game of ordered) {
        if (timeClass !== undefined && game.time_class !== timeClass) continue;
        if (rated !== undefined && game.rated !== rated) continue;
        yield game;
      }
    }
  }

  /** Perform a GET, then validate the body against `schema`. */
  async #get<T>(
    path: string,
    schema: ZodType<T>,
    options?: RequestOptions,
  ): Promise<T> {
    const url = `${this.#baseUrl}${path}`;
    const response = await this.#transport.request({
      url,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    return this.#validate(schema, response.body, url);
  }

  /** Apply the schema, honoring the configured {@link ValidationErrorMode}. */
  #validate<T>(schema: ZodType<T>, body: unknown, url: string): T {
    const result = schema.safeParse(body);
    if (result.success) {
      return result.data;
    }
    if (this.#onValidationError === "throw") {
      throw new ValidationError(
        `Response from ${url} did not match the expected schema: ${result.error.message}`,
        { url, cause: result.error },
      );
    }
    if (this.#onValidationError === "warn") {
      console.warn(
        `[chesscom] Response from ${url} failed schema validation; returning it unvalidated.`,
        result.error,
      );
    }
    return body as T;
  }
}

/** Build the `YYYY/MM` path segment, validating and zero-padding the month. */
function monthSegment(year: number, month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(
      `month must be an integer in 1-12, got ${String(month)}`,
    );
  }
  return `${String(year)}/${String(month).padStart(2, "0")}`;
}

/** A parsed monthly archive: its year/month and a sortable `YYYY-MM` key. */
interface ArchiveMonth {
  readonly year: number;
  readonly number: number;
  readonly key: string;
}

/** Parse `.../games/YYYY/MM` from an archive URL; `undefined` if it doesn't match. */
function parseArchiveMonth(url: string): ArchiveMonth | undefined {
  const match = /\/(\d{4})\/(\d{2})$/.exec(url);
  if (match === null) return undefined;
  const [, yearStr, monthStr] = match;
  if (yearStr === undefined || monthStr === undefined) return undefined;
  return {
    year: Number(yearStr),
    number: Number(monthStr),
    key: `${yearStr}-${monthStr}`,
  };
}

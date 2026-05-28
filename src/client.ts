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

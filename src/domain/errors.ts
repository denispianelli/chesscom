/**
 * Error hierarchy for the SDK.
 *
 * All errors thrown by the SDK extend {@link ChessComError} and carry a
 * discriminant `kind`, so callers can branch with either `instanceof` or a
 * `switch (err.kind)`. Pure domain code: no dependency on zod, fetch, or any
 * infrastructure detail.
 */

/** Discriminant identifying the category of a {@link ChessComError}. */
export type ChessComErrorKind =
  | "not_found"
  | "rate_limit"
  | "forbidden"
  | "server"
  | "validation"
  | "network";

/** Common construction options shared by every SDK error. */
export interface ChessComErrorOptions {
  /** The request URL the error relates to. */
  readonly url: string;
  /** HTTP status code, when the error originates from a response. */
  readonly status?: number;
  /** Underlying cause (e.g. the original network exception). */
  readonly cause?: unknown;
}

/** Base class for every error thrown by the SDK. */
export abstract class ChessComError extends Error {
  /** Category discriminant — narrow on this in a `switch`. */
  abstract readonly kind: ChessComErrorKind;

  /** The request URL the error relates to. */
  readonly url: string;

  /** HTTP status code, or `undefined` for transport-level failures. */
  readonly status: number | undefined;

  constructor(message: string, options: ChessComErrorOptions) {
    super(message, { cause: options.cause });
    // `new.target` is always a concrete subclass (base is abstract).
    this.name = new.target.name;
    this.url = options.url;
    this.status = options.status;
  }
}

/** A requested resource does not exist (HTTP 404 / 410). */
export class NotFoundError extends ChessComError {
  readonly kind = "not_found";
}

/**
 * Request was refused (HTTP 403). On the Chess.com API this almost always means
 * a missing or rejected `User-Agent`.
 */
export class ForbiddenError extends ChessComError {
  readonly kind = "forbidden";
}

/** Construction options for {@link RateLimitError}. */
export interface RateLimitErrorOptions extends ChessComErrorOptions {
  /** Server-advised wait before retrying, in milliseconds (from `Retry-After`). */
  readonly retryAfterMs?: number;
}

/** The client was rate limited (HTTP 429) and retries were exhausted. */
export class RateLimitError extends ChessComError {
  readonly kind = "rate_limit";

  /** Server-advised wait before retrying, in milliseconds, if provided. */
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: RateLimitErrorOptions) {
    super(message, options);
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** The server returned an unexpected status (HTTP 5xx or other non-OK code). */
export class ServerError extends ChessComError {
  readonly kind = "server";
}

/** A response did not match its expected schema (zod validation failed). */
export class ValidationError extends ChessComError {
  readonly kind = "validation";
}

/**
 * The request never produced an HTTP response: a network failure, a DNS error,
 * or a timeout. The original exception is available on {@link ChessComError.cause}.
 */
export class NetworkError extends ChessComError {
  readonly kind = "network";
}

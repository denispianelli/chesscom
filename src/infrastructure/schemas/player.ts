import { z } from "zod";

/**
 * Zod schemas for the player endpoints, hand-written from real API responses
 * (the Chess.com API ships no OpenAPI spec) and cross-checked against the docs.
 *
 * Conventions:
 * - Faithful to the wire: kept as-is, including `@id` and Unix-second timestamps
 *   (numbers, not `Date`). We validate and re-expose; we do not re-model.
 * - Defensive on optionality: any field that a "poor" profile (new, closed,
 *   untitled) can omit is `.optional()`.
 * - Open enumerations (`status`, `title`, …) are `z.string()`, not `z.enum`, so a
 *   new server-side value validates instead of throwing.
 * - Objects strip unknown keys by default, so new API fields never break parsing.
 *
 * Public types are derived from these schemas via `z.infer` — one source of truth.
 */

const streamingPlatformSchema = z.object({
  type: z.string(),
  channel_url: z.string(),
});

/** A player's public profile — `GET /pub/player/{username}`. */
export const playerProfileSchema = z.object({
  "@id": z.string(),
  url: z.string(),
  username: z.string(),
  player_id: z.number(),
  status: z.string(),
  joined: z.number(),
  last_online: z.number(),
  followers: z.number(),
  is_streamer: z.boolean(),
  verified: z.boolean(),
  country: z.string(),
  league: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  avatar: z.string().optional(),
  location: z.string().optional(),
  twitch_url: z.string().optional(),
  streaming_platforms: z.array(streamingPlatformSchema).optional(),
});

/** The `last`/`current` rating point of a category. */
const lastRatingSchema = z.object({
  rating: z.number(),
  date: z.number(),
  rd: z.number().optional(),
});

/** The `best` rating point of a category, linking the game that reached it. */
const bestRatingSchema = z.object({
  rating: z.number(),
  date: z.number(),
  game: z.string(),
});

/** Win/loss/draw tally. `time_per_move`/`timeout_percent` appear for daily only. */
const recordSchema = z.object({
  win: z.number(),
  loss: z.number(),
  draw: z.number(),
  time_per_move: z.number().optional(),
  timeout_percent: z.number().optional(),
});

/** Daily-tournament summary, present only for the daily categories. */
const tournamentSchema = z.object({
  points: z.number(),
  withdraw: z.number(),
  count: z.number(),
  highest_finish: z.number(),
});

/**
 * Stats for one time category (blitz, rapid, daily, …). Every part is optional:
 * a category key can exist with only some of these populated.
 */
const gameStatsSchema = z.object({
  last: lastRatingSchema.optional(),
  best: bestRatingSchema.optional(),
  record: recordSchema.optional(),
  tournament: tournamentSchema.optional(),
});

const ratingMomentSchema = z.object({
  rating: z.number(),
  date: z.number(),
});

const puzzleRushScoreSchema = z.object({
  best: z.object({ total_attempts: z.number(), score: z.number() }).optional(),
  daily: z.object({ total_attempts: z.number(), score: z.number() }).optional(),
});

/** A player's stats — `GET /pub/player/{username}/stats`. */
export const playerStatsSchema = z.object({
  chess_daily: gameStatsSchema.optional(),
  chess960_daily: gameStatsSchema.optional(),
  chess_rapid: gameStatsSchema.optional(),
  chess_bullet: gameStatsSchema.optional(),
  chess_blitz: gameStatsSchema.optional(),
  fide: z.number().optional(),
  tactics: z
    .object({
      highest: ratingMomentSchema.optional(),
      lowest: ratingMomentSchema.optional(),
    })
    .optional(),
  puzzle_rush: puzzleRushScoreSchema.optional(),
});

/** The list of monthly archive URLs — `GET /pub/player/{username}/games/archives`. */
export const playerArchivesSchema = z.object({
  archives: z.array(z.string()),
});

/** A player's public profile. */
export type PlayerProfile = z.infer<typeof playerProfileSchema>;
/** A player's rating and game stats across time categories. */
export type PlayerStats = z.infer<typeof playerStatsSchema>;
/** The list of a player's monthly game-archive URLs. */
export type PlayerArchives = z.infer<typeof playerArchivesSchema>;

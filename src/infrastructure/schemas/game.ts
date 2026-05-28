import { z } from "zod";

/**
 * Zod schemas for games — `GET /pub/player/{username}/games/{YYYY}/{MM}`.
 *
 * Same conventions as `player.ts`: faithful to the wire, defensive on
 * optionality, open enums as `z.string()`. The `pgn` is exposed as a raw string
 * (no move parsing — that is the consumer's job, with their own library).
 */

/** One side of a game. */
const gamePlayerSchema = z.object({
  "@id": z.string(),
  username: z.string(),
  rating: z.number(),
  /** Outcome for this side: `win`, `timeout`, `resigned`, `checkmated`, … */
  result: z.string(),
  uuid: z.string().optional(),
});

const accuraciesSchema = z.object({
  white: z.number(),
  black: z.number(),
});

/** A single finished game. */
export const gameSchema = z.object({
  url: z.string(),
  /** Raw PGN of the game. Parse it with your own library if you need moves. */
  pgn: z.string().optional(),
  time_control: z.string(),
  end_time: z.number(),
  rated: z.boolean(),
  /** `bullet` | `blitz` | `rapid` | `daily`. */
  time_class: z.string(),
  /** `chess` | `chess960` | `bughouse` | `kingofthehill` | … */
  rules: z.string(),
  white: gamePlayerSchema,
  black: gamePlayerSchema,
  uuid: z.string().optional(),
  /** Final position (FEN). Absent for some games. */
  fen: z.string().optional(),
  /** Chess.com's compact move encoding. */
  tcn: z.string().optional(),
  initial_setup: z.string().optional(),
  /** Opening URL (chess.com/openings/…), present when classified. */
  eco: z.string().optional(),
  /** Computed accuracies, present only when game analysis exists. */
  accuracies: accuraciesSchema.optional(),
  /** Start time (daily games only). */
  start_time: z.number().optional(),
  /** Team-match URL (daily team matches). */
  match: z.string().optional(),
  /** Tournament URL (tournament games). */
  tournament: z.string().optional(),
});

/** The games of one month — the API wraps them in `{ games: [...] }`. */
export const monthlyGamesSchema = z.object({
  games: z.array(gameSchema),
});

/** One side of a game. */
export type GamePlayer = z.infer<typeof gamePlayerSchema>;
/** A single finished game (raw PGN + structured metadata). */
export type Game = z.infer<typeof gameSchema>;
/** A month's worth of games. */
export type MonthlyGames = z.infer<typeof monthlyGamesSchema>;

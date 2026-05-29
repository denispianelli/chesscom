import { z } from "zod";

/**
 * Zod schema for `GET /pub/leaderboards`. Same conventions as `player.ts`:
 * faithful to the wire, defensive on optionality, open enums as `z.string()`.
 */

const trendSchema = z.object({
  direction: z.number(),
  delta: z.number(),
});

/** One ranked entry on a leaderboard. */
const leaderboardEntrySchema = z.object({
  player_id: z.number(),
  "@id": z.string(),
  url: z.string(),
  username: z.string(),
  score: z.number(),
  rank: z.number(),
  country: z.string().optional(),
  country_id: z.number().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  status: z.string().optional(),
  avatar: z.string().optional(),
  flair_code: z.string().optional(),
  trend_score: trendSchema.optional(),
  trend_rank: trendSchema.optional(),
  win_count: z.number().optional(),
  loss_count: z.number().optional(),
  draw_count: z.number().optional(),
});

const board = z.array(leaderboardEntrySchema);

/** Global leaderboards, one board per category (all optional). */
export const leaderboardsSchema = z.object({
  daily: board.optional(),
  daily960: board.optional(),
  live_rapid: board.optional(),
  live_blitz: board.optional(),
  live_bullet: board.optional(),
  live_bughouse: board.optional(),
  live_blitz960: board.optional(),
  live_threecheck: board.optional(),
  live_crazyhouse: board.optional(),
  live_kingofthehill: board.optional(),
  tactics: board.optional(),
  rush: board.optional(),
  battle: board.optional(),
});

/** One ranked leaderboard entry. */
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
/** The global leaderboards, by category. */
export type Leaderboards = z.infer<typeof leaderboardsSchema>;

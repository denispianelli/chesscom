import { z } from "zod";

/** Zod schema for the daily puzzle — `GET /pub/puzzle` and `/pub/puzzle/random`. */
export const puzzleSchema = z.object({
  title: z.string(),
  url: z.string(),
  publish_time: z.number(),
  fen: z.string(),
  /** Raw PGN of the puzzle line. */
  pgn: z.string(),
  image: z.string().optional(),
});

/** A daily (or random) puzzle. */
export type Puzzle = z.infer<typeof puzzleSchema>;

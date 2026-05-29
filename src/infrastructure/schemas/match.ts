import { z } from "zod";
import { gameSchema } from "./game.js";

/**
 * Zod schemas for team matches. Same conventions as `player.ts`: faithful to the
 * wire, defensive on optionality, open enums as `z.string()`.
 */

// --- Match detail: GET /pub/match/{id} ---

const matchSettingsSchema = z.object({
  rules: z.string(),
  time_class: z.string(),
  time_control: z.string(),
  initial_setup: z.string().optional(),
  min_team_players: z.number().optional(),
  max_team_players: z.number().optional(),
  min_required_games: z.number().optional(),
  autostart: z.boolean().optional(),
  rated: z.boolean().optional(),
});

const matchTeamPlayerSchema = z.object({
  username: z.string(),
  board: z.string().optional(),
  stats: z.string().optional(),
  status: z.string().optional(),
  played_as_white: z.string().optional(),
  played_as_black: z.string().optional(),
});

const matchTeamSchema = z.object({
  "@id": z.string(),
  name: z.string(),
  url: z.string(),
  score: z.number(),
  result: z.string().optional(),
  players: z.array(matchTeamPlayerSchema),
  fair_play_removals: z.array(z.string()).optional(),
});

/** A team match — `GET /pub/match/{id}`. */
export const matchSchema = z.object({
  "@id": z.string(),
  name: z.string(),
  url: z.string(),
  status: z.string(),
  boards: z.number(),
  settings: matchSettingsSchema,
  teams: z.object({ team1: matchTeamSchema, team2: matchTeamSchema }),
  description: z.string().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
});

/** A single board of a team match — `GET /pub/match/{id}/{board}`. */
export const matchBoardSchema = z.object({
  board_scores: z.record(z.string(), z.number()).optional(),
  games: z.array(gameSchema),
});

// --- Match lists ---

const playerMatchEntrySchema = z.object({
  name: z.string(),
  "@id": z.string(),
  url: z.string().optional(),
  club: z.string().optional(),
  board: z.string().optional(),
  results: z
    .object({
      played_as_white: z.string().optional(),
      played_as_black: z.string().optional(),
    })
    .optional(),
});

/** A player's team matches — `GET /pub/player/{username}/matches`. */
export const playerMatchesSchema = z.object({
  finished: z.array(playerMatchEntrySchema).optional(),
  in_progress: z.array(playerMatchEntrySchema).optional(),
  registered: z.array(playerMatchEntrySchema).optional(),
});

const clubMatchEntrySchema = z.object({
  name: z.string(),
  "@id": z.string(),
  url: z.string().optional(),
  opponent: z.string().optional(),
  start_time: z.number().optional(),
  time_class: z.string().optional(),
  result: z.string().optional(),
});

/** A club's team matches — `GET /pub/club/{url-id}/matches`. */
export const clubMatchesSchema = z.object({
  finished: z.array(clubMatchEntrySchema).optional(),
  in_progress: z.array(clubMatchEntrySchema).optional(),
  registered: z.array(clubMatchEntrySchema).optional(),
});

/** Settings of a team match. */
export type MatchSettings = z.infer<typeof matchSettingsSchema>;
/** One player on a match team. */
export type MatchTeamPlayer = z.infer<typeof matchTeamPlayerSchema>;
/** One side of a team match. */
export type MatchTeam = z.infer<typeof matchTeamSchema>;
/** A team match. */
export type Match = z.infer<typeof matchSchema>;
/** A single board of a team match. */
export type MatchBoard = z.infer<typeof matchBoardSchema>;
/** One entry in a player's match list. */
export type PlayerMatchEntry = z.infer<typeof playerMatchEntrySchema>;
/** A player's team matches, grouped by state. */
export type PlayerMatches = z.infer<typeof playerMatchesSchema>;
/** One entry in a club's match list. */
export type ClubMatchEntry = z.infer<typeof clubMatchEntrySchema>;
/** A club's team matches, grouped by state. */
export type ClubMatches = z.infer<typeof clubMatchesSchema>;

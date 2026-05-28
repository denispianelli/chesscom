import { z } from "zod";

/**
 * Zod schemas for the tournament endpoints. Same conventions as `player.ts`.
 * Settings vary widely by tournament type, so most of them are optional.
 */

const tournamentSettingsSchema = z.object({
  type: z.string(),
  rules: z.string(),
  time_class: z.string(),
  time_control: z.string(),
  is_rated: z.boolean().optional(),
  is_official: z.boolean().optional(),
  is_invite_only: z.boolean().optional(),
  initial_group_size: z.number().optional(),
  user_advance_count: z.number().optional(),
  use_tiebreak: z.boolean().optional(),
  allow_vacation: z.boolean().optional(),
  winner_places: z.number().optional(),
  registered_user_count: z.number().optional(),
  games_per_opponent: z.number().optional(),
  total_rounds: z.number().optional(),
  concurrent_games_per_opponent: z.number().optional(),
});

const tournamentPlayerSchema = z.object({
  username: z.string(),
  status: z.string(),
});

/** A tournament — `GET /pub/tournament/{url-id}`. */
export const tournamentSchema = z.object({
  name: z.string(),
  url: z.string(),
  creator: z.string(),
  status: z.string(),
  settings: tournamentSettingsSchema,
  players: z.array(tournamentPlayerSchema),
  rounds: z.array(z.string()),
  description: z.string().optional(),
  start_time: z.number().optional(),
  finish_time: z.number().optional(),
});

const playerTournamentEntrySchema = z.object({
  "@id": z.string(),
  url: z.string(),
  status: z.string(),
  wins: z.number().optional(),
  losses: z.number().optional(),
  draws: z.number().optional(),
  points_awarded: z.number().optional(),
  placement: z.number().optional(),
  total_players: z.number().optional(),
});

/** A player's tournament participation — `GET /pub/player/{username}/tournaments`. */
export const playerTournamentsSchema = z.object({
  finished: z.array(playerTournamentEntrySchema).optional(),
  in_progress: z.array(playerTournamentEntrySchema).optional(),
  registered: z.array(playerTournamentEntrySchema).optional(),
});

/** A tournament's settings. */
export type TournamentSettings = z.infer<typeof tournamentSettingsSchema>;
/** One player entry in a tournament. */
export type TournamentPlayer = z.infer<typeof tournamentPlayerSchema>;
/** A tournament. */
export type Tournament = z.infer<typeof tournamentSchema>;
/** One entry in a player's tournament participation list. */
export type PlayerTournamentEntry = z.infer<typeof playerTournamentEntrySchema>;
/** A player's tournament participation, grouped by state. */
export type PlayerTournaments = z.infer<typeof playerTournamentsSchema>;

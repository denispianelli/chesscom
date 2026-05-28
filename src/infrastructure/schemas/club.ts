import { z } from "zod";

/**
 * Zod schemas for the club endpoints. Same conventions as `player.ts`:
 * faithful to the wire, defensive on optionality, open enums as `z.string()`.
 */

/** A club's public profile — `GET /pub/club/{url-id}`. */
export const clubProfileSchema = z.object({
  "@id": z.string(),
  name: z.string(),
  club_id: z.number(),
  url: z.string(),
  country: z.string(),
  members_count: z.number(),
  created: z.number(),
  last_activity: z.number(),
  visibility: z.string(),
  admin: z.array(z.string()),
  average_daily_rating: z.number().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  join_request: z.string().optional(),
});

const clubMemberSchema = z.object({
  username: z.string(),
  joined: z.number(),
});

/** Club members grouped by recent activity — `GET /pub/club/{url-id}/members`. */
export const clubMembersSchema = z.object({
  weekly: z.array(clubMemberSchema),
  monthly: z.array(clubMemberSchema),
  all_time: z.array(clubMemberSchema),
});

const playerClubSchema = z.object({
  "@id": z.string(),
  name: z.string(),
  url: z.string(),
  joined: z.number(),
  icon: z.string().optional(),
  last_activity: z.number().optional(),
});

/** The clubs a player belongs to — `GET /pub/player/{username}/clubs`. */
export const playerClubsSchema = z.object({
  clubs: z.array(playerClubSchema),
});

/** A club's public profile. */
export type ClubProfile = z.infer<typeof clubProfileSchema>;
/** One club member entry. */
export type ClubMember = z.infer<typeof clubMemberSchema>;
/** Club members grouped by activity. */
export type ClubMembers = z.infer<typeof clubMembersSchema>;
/** A club as listed on a player's membership list. */
export type PlayerClub = z.infer<typeof playerClubSchema>;
/** The clubs a player belongs to. */
export type PlayerClubs = z.infer<typeof playerClubsSchema>;

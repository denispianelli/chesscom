import { z } from "zod";

/** Zod schemas for the country endpoints. */

/** A country profile — `GET /pub/country/{iso}`. */
export const countrySchema = z.object({
  "@id": z.string(),
  code: z.string(),
  name: z.string(),
});

/** Usernames of players from a country — `GET /pub/country/{iso}/players`. */
export const countryPlayersSchema = z.object({
  players: z.array(z.string()),
});

/** Club URLs from a country — `GET /pub/country/{iso}/clubs`. */
export const countryClubsSchema = z.object({
  clubs: z.array(z.string()),
});

/** A country profile. */
export type Country = z.infer<typeof countrySchema>;
/** The `{ players }` wrapper for a country's players. */
export type CountryPlayers = z.infer<typeof countryPlayersSchema>;
/** The `{ clubs }` wrapper for a country's clubs. */
export type CountryClubs = z.infer<typeof countryClubsSchema>;

import { describe, expect, it } from "vitest";
import country from "../../../test/fixtures/country.json";
import countryPlayers from "../../../test/fixtures/country-players.json";
import countryClubs from "../../../test/fixtures/country-clubs.json";
import {
  countryClubsSchema,
  countryPlayersSchema,
  countrySchema,
} from "./country.js";

describe("countrySchema", () => {
  it("accepts a real country profile", () => {
    const parsed = countrySchema.parse(country);
    expect(parsed.code).toBeTypeOf("string");
    expect(parsed.name).toBeTypeOf("string");
  });

  it("rejects a country missing its code", () => {
    const { code, ...rest } = country;
    void code;
    expect(countrySchema.safeParse(rest).success).toBe(false);
  });
});

describe("country players and clubs", () => {
  it("accept the players and clubs string lists", () => {
    expect(
      countryPlayersSchema.parse(countryPlayers).players.length,
    ).toBeGreaterThan(0);
    expect(countryClubsSchema.parse(countryClubs).clubs.length).toBeGreaterThan(
      0,
    );
  });
});

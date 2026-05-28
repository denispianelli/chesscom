import { describe, expect, it } from "vitest";
import tournament from "../../../test/fixtures/tournament.json";
import playerTournaments from "../../../test/fixtures/player-tournaments-erik.json";
import { playerTournamentsSchema, tournamentSchema } from "./tournament.js";

describe("tournamentSchema", () => {
  it("accepts a real tournament", () => {
    const parsed = tournamentSchema.parse(tournament);
    expect(parsed.settings.time_class).toBeTypeOf("string");
    expect(parsed.players.length).toBeGreaterThan(0);
    expect(parsed.rounds.length).toBeGreaterThan(0);
  });

  it("rejects a tournament missing its settings", () => {
    const { settings, ...withoutSettings } = tournament;
    void settings;
    expect(tournamentSchema.safeParse(withoutSettings).success).toBe(false);
  });
});

describe("playerTournamentsSchema", () => {
  it("accepts a player's tournament participation", () => {
    const parsed = playerTournamentsSchema.parse(playerTournaments);
    expect(parsed.finished?.[0]?.status).toBeTypeOf("string");
  });

  it("accepts an empty participation object", () => {
    expect(playerTournamentsSchema.parse({})).toEqual({});
  });
});

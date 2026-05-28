import { describe, expect, it } from "vitest";
import gamesFixture from "../../../test/fixtures/games-erik-2024-01.json";
import { gameSchema, monthlyGamesSchema } from "./game.js";

const month = monthlyGamesSchema.parse(gamesFixture);
const sample = month.games[0];
if (sample === undefined) {
  throw new Error("fixture must contain at least one game");
}

describe("monthlyGamesSchema", () => {
  it("accepts a real month of games (erik 2024-01)", () => {
    expect(month.games.length).toBeGreaterThan(0);
    expect(sample.pgn).toContain("[Event");
  });

  it("accepts a game with no accuracies (no analysis)", () => {
    const noAccuracies = month.games.find((g) => g.accuracies === undefined);
    expect(noAccuracies).toBeDefined();
    expect(gameSchema.safeParse(noAccuracies).success).toBe(true);
  });
});

describe("gameSchema", () => {
  it("accepts daily-only fields (start_time, match, tournament)", () => {
    const daily = {
      ...sample,
      time_class: "daily",
      start_time: 1700000000,
      match: "https://api.chess.com/pub/match/12345",
      tournament: "https://api.chess.com/pub/tournament/x",
    };
    expect(gameSchema.safeParse(daily).success).toBe(true);
  });

  it("rejects a game missing a required field (url)", () => {
    const { url, ...withoutUrl } = sample;
    void url;
    expect(gameSchema.safeParse(withoutUrl).success).toBe(false);
  });
});

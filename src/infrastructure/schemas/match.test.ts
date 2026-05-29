import { describe, expect, it } from "vitest";
import match from "../../../test/fixtures/match.json";
import matchBoard from "../../../test/fixtures/match-board.json";
import playerMatches from "../../../test/fixtures/player-matches-erik.json";
import clubMatches from "../../../test/fixtures/club-matches-team-usa.json";
import {
  clubMatchesSchema,
  matchBoardSchema,
  matchSchema,
  playerMatchesSchema,
} from "./match.js";

describe("matchSchema", () => {
  it("accepts a real team match", () => {
    const m = matchSchema.parse(match);
    expect(m.boards).toBeTypeOf("number");
    expect(m.teams.team1.players.length).toBeGreaterThan(0);
  });

  it("rejects a match missing its teams", () => {
    const { teams, ...rest } = match;
    void teams;
    expect(matchSchema.safeParse(rest).success).toBe(false);
  });
});

describe("matchBoardSchema", () => {
  it("accepts a real board (games + board_scores)", () => {
    const b = matchBoardSchema.parse(matchBoard);
    expect(b.games.length).toBeGreaterThan(0);
    expect(b.games[0]?.pgn).toBeTypeOf("string");
  });
});

describe("match lists", () => {
  it("accept real player and club match lists", () => {
    expect(playerMatchesSchema.safeParse(playerMatches).success).toBe(true);
    expect(clubMatchesSchema.safeParse(clubMatches).success).toBe(true);
  });
});

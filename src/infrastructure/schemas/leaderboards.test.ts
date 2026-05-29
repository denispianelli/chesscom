import { describe, expect, it } from "vitest";
import leaderboards from "../../../test/fixtures/leaderboards.json";
import { leaderboardsSchema } from "./leaderboards.js";

describe("leaderboardsSchema", () => {
  it("accepts the real leaderboards across categories", () => {
    const parsed = leaderboardsSchema.parse(leaderboards);
    const top = parsed.live_blitz?.[0];
    expect(top?.rank).toBeTypeOf("number");
    expect(top?.username).toBeTypeOf("string");
  });

  it("rejects an entry with a wrongly typed score", () => {
    const bad = {
      live_blitz: [
        {
          player_id: 1,
          "@id": "a",
          url: "b",
          username: "c",
          score: "not-a-number",
          rank: 1,
        },
      ],
    };
    expect(leaderboardsSchema.safeParse(bad).success).toBe(false);
  });
});

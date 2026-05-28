import { describe, expect, it } from "vitest";
import erikProfile from "../../../test/fixtures/player-erik.json";
import hikaruProfile from "../../../test/fixtures/player-hikaru.json";
import erikStats from "../../../test/fixtures/stats-erik.json";
import erikArchives from "../../../test/fixtures/archives-erik.json";
import {
  playerArchivesSchema,
  playerProfileSchema,
  playerStatsSchema,
} from "./player.js";

describe("playerProfileSchema", () => {
  it("accepts a full profile (erik)", () => {
    const profile = playerProfileSchema.parse(erikProfile);
    expect(profile.username).toBe("erik");
    expect(profile.title).toBeUndefined();
  });

  it("accepts a titled, streaming profile (hikaru)", () => {
    const profile = playerProfileSchema.parse(hikaruProfile);
    expect(profile.title).toBe("GM");
    expect(profile.streaming_platforms?.[0]?.type).toBe("twitch");
  });

  it("rejects a profile with a wrongly typed field", () => {
    const result = playerProfileSchema.safeParse({
      ...erikProfile,
      player_id: "not-a-number",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a profile missing a required field", () => {
    const { username, ...withoutUsername } = erikProfile;
    void username;
    expect(playerProfileSchema.safeParse(withoutUsername).success).toBe(false);
  });
});

describe("playerStatsSchema", () => {
  it("accepts real stats with mixed categories (erik)", () => {
    const stats = playerStatsSchema.parse(erikStats);
    expect(stats.chess_blitz?.last?.rating).toBeTypeOf("number");
    expect(stats.fide).toBeTypeOf("number");
  });

  it("accepts an empty stats object (player with no rated play)", () => {
    expect(playerStatsSchema.parse({})).toEqual({});
  });
});

describe("playerArchivesSchema", () => {
  it("accepts the archives list (erik)", () => {
    const { archives } = playerArchivesSchema.parse(erikArchives);
    expect(Array.isArray(archives)).toBe(true);
    expect(archives[0]).toMatch(/\/pub\/player\/erik\/games\/\d{4}\/\d{2}$/);
  });

  it("rejects a non-string entry in the list", () => {
    expect(
      playerArchivesSchema.safeParse({ archives: ["ok", 42] }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import clubProfile from "../../../test/fixtures/club-dev-community.json";
import clubMembers from "../../../test/fixtures/club-members-team-usa.json";
import playerClubs from "../../../test/fixtures/player-clubs-erik.json";
import {
  clubMembersSchema,
  clubProfileSchema,
  playerClubsSchema,
} from "./club.js";

describe("clubProfileSchema", () => {
  it("accepts a real club profile", () => {
    const club = clubProfileSchema.parse(clubProfile);
    expect(club.club_id).toBeTypeOf("number");
    expect(Array.isArray(club.admin)).toBe(true);
  });

  it("rejects a profile missing a required field", () => {
    const { name, ...withoutName } = clubProfile;
    void name;
    expect(clubProfileSchema.safeParse(withoutName).success).toBe(false);
  });
});

describe("clubMembersSchema", () => {
  it("accepts the three activity groups", () => {
    const members = clubMembersSchema.parse(clubMembers);
    expect(members.weekly[0]?.username).toBeTypeOf("string");
    expect(members.all_time).toBeDefined();
  });
});

describe("playerClubsSchema", () => {
  it("accepts a player's clubs list", () => {
    const { clubs } = playerClubsSchema.parse(playerClubs);
    expect(clubs.length).toBeGreaterThan(0);
    expect(clubs[0]?.joined).toBeTypeOf("number");
  });
});

import { describe, expect, it } from "vitest";
import { ChessComClient } from "../../src/index.js";

// Live tests against the real Chess.com API. Run with `npm run test:integration`.
// They use stable, long-lived resources (erik = founder, team-usa, a finished
// tournament). Their real value: confirming our hand-written schemas still match
// the API's current responses across every endpoint.

const client = new ChessComClient({
  userAgent:
    "chesscom-sdk-integration-test/0.0 (https://github.com/denispianelli/chesscom)",
});

const STABLE_TOURNAMENT = "100-years-of-chemotherapy---remembrance-tournament";

describe("live: players", () => {
  it("getPlayer", async () => {
    const profile = await client.getPlayer("erik");
    expect(profile.username).toBe("erik");
    expect(profile.player_id).toBeTypeOf("number");
  });

  it("getPlayerStats", async () => {
    const stats = await client.getPlayerStats("erik");
    expect(stats).toBeTypeOf("object");
  });

  it("getPlayerArchives", async () => {
    const archives = await client.getPlayerArchives("erik");
    expect(archives.length).toBeGreaterThan(0);
    expect(archives[0]).toMatch(/\/games\/\d{4}\/\d{2}$/);
  });

  it("getPlayerGames", async () => {
    const games = await client.getPlayerGames("erik", 2024, 1);
    expect(games.length).toBeGreaterThan(0);
    expect(games[0]?.pgn).toBeTypeOf("string");
  });

  it("streamPlayerGames (single month, early break)", async () => {
    const urls: string[] = [];
    for await (const game of client.streamPlayerGames("erik", {
      since: "2024-01",
      until: "2024-01",
    })) {
      urls.push(game.url);
      if (urls.length >= 5) break;
    }
    expect(urls.length).toBeGreaterThan(0);
  });

  it("getPlayerClubs", async () => {
    const clubs = await client.getPlayerClubs("erik");
    expect(Array.isArray(clubs)).toBe(true);
  });

  it("getPlayerTournaments", async () => {
    const tournaments = await client.getPlayerTournaments("erik");
    expect(tournaments).toBeTypeOf("object");
  });
});

describe("live: clubs", () => {
  it("getClub", async () => {
    const club = await client.getClub("team-usa");
    expect(club.name).toBeTypeOf("string");
    expect(club.club_id).toBeTypeOf("number");
  });

  it("getClubMembers", async () => {
    const members = await client.getClubMembers("team-usa");
    expect(Array.isArray(members.weekly)).toBe(true);
    expect(Array.isArray(members.all_time)).toBe(true);
  });
});

describe("live: tournaments", () => {
  it("getTournament", async () => {
    const tournament = await client.getTournament(STABLE_TOURNAMENT);
    expect(tournament.players.length).toBeGreaterThan(0);
    expect(tournament.settings.time_class).toBeTypeOf("string");
  });
});

describe("live: global", () => {
  it("getLeaderboards", async () => {
    const lb = await client.getLeaderboards();
    expect((lb.live_blitz?.length ?? 0) > 0).toBe(true);
  });

  it("getStreamers", async () => {
    const streamers = await client.getStreamers();
    expect(Array.isArray(streamers)).toBe(true);
  });

  it("getDailyPuzzle", async () => {
    const puzzle = await client.getDailyPuzzle();
    expect(puzzle.fen).toBeTypeOf("string");
  });

  it("getCountry + players + clubs", async () => {
    const country = await client.getCountry("IS");
    expect(country.code).toBe("IS");
    expect(Array.isArray(await client.getCountryPlayers("IS"))).toBe(true);
    expect(Array.isArray(await client.getCountryClubs("IS"))).toBe(true);
  });
});

describe("live: errors", () => {
  it("throws NotFoundError for a non-existent player", async () => {
    await expect(
      client.getPlayer("this-user-should-not-exist-xyz-123456"),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});

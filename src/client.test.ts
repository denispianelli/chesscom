import { afterEach, describe, expect, it, vi } from "vitest";
import erikProfile from "../test/fixtures/player-erik.json";
import erikGames from "../test/fixtures/games-erik-2024-01.json";
import clubProfile from "../test/fixtures/club-dev-community.json";
import clubMembers from "../test/fixtures/club-members-team-usa.json";
import playerClubs from "../test/fixtures/player-clubs-erik.json";
import tournament from "../test/fixtures/tournament.json";
import playerTournaments from "../test/fixtures/player-tournaments-erik.json";
import leaderboards from "../test/fixtures/leaderboards.json";
import streamers from "../test/fixtures/streamers.json";
import puzzle from "../test/fixtures/puzzle.json";
import country from "../test/fixtures/country.json";
import countryPlayers from "../test/fixtures/country-players.json";
import countryClubs from "../test/fixtures/country-clubs.json";
import match from "../test/fixtures/match.json";
import matchBoard from "../test/fixtures/match-board.json";
import playerMatches from "../test/fixtures/player-matches-erik.json";
import clubMatches from "../test/fixtures/club-matches-team-usa.json";
import { ChessComClient } from "./client.js";
import { NotFoundError, ValidationError } from "./domain/errors.js";

const UA = "test/1.0 (ci@example.com)";

/** A fetch mock that records calls and returns a scripted Response. */
function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** A fetch that routes by URL and records which URLs were requested. */
function routedFetch(routes: Record<string, unknown>) {
  const requested: string[] = [];
  const fn = vi.fn((url: string) => {
    requested.push(url);
    return Promise.resolve(url in routes ? json(routes[url]) : json({}, 404));
  });
  return { fn: fn as unknown as typeof fetch, requested };
}

/** A minimal game object that satisfies the schema, with overrides. */
function makeGame(over: Record<string, unknown> = {}) {
  return {
    url: "https://www.chess.com/game/live/1",
    time_control: "60",
    end_time: 1,
    rated: true,
    time_class: "bullet",
    rules: "chess",
    white: { "@id": "a", username: "erik", rating: 1, result: "win" },
    black: { "@id": "b", username: "opp", rating: 1, result: "resigned" },
    ...over,
  };
}

const ARCHIVES_URL = "https://api.chess.com/pub/player/erik/games/archives";
const JAN_URL = "https://api.chess.com/pub/player/erik/games/2024/01";
const FEB_URL = "https://api.chess.com/pub/player/erik/games/2024/02";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChessComClient construction", () => {
  it("requires a non-empty userAgent", () => {
    expect(() => new ChessComClient({ userAgent: "" })).toThrow(TypeError);
    expect(() => new ChessComClient({ userAgent: "   " })).toThrow(TypeError);
  });
});

describe("ChessComClient.getPlayer", () => {
  it("builds the right URL, sends the User-Agent, and returns the parsed profile", async () => {
    const { fn, calls } = mockFetch(() => json(erikProfile));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const profile = await client.getPlayer("erik");

    expect(profile.username).toBe("erik");
    expect(calls[0]?.url).toBe("https://api.chess.com/pub/player/erik");
    expect(
      (calls[0]?.init?.headers as Record<string, string>)["User-Agent"],
    ).toBe(UA);
  });

  it("URL-encodes the username", async () => {
    const { fn, calls } = mockFetch(() => json(erikProfile));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await client.getPlayer("a b/c");

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/player/a%20b%2Fc");
  });

  it("propagates a typed NotFoundError on 404", async () => {
    const { fn } = mockFetch(() => json({ message: "not found" }, 404));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await expect(client.getPlayer("ghost")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("ChessComClient.getPlayerGames", () => {
  it("builds a zero-padded month URL and returns the unwrapped games array", async () => {
    const { fn, calls } = mockFetch(() => json(erikGames));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const result = await client.getPlayerGames("erik", 2024, 1);

    expect(calls[0]?.url).toBe(
      "https://api.chess.com/pub/player/erik/games/2024/01",
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(erikGames.games.length);
  });

  it("rejects an out-of-range month before making a request", async () => {
    const { fn, calls } = mockFetch(() => json(erikGames));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await expect(
      client.getPlayerGames("erik", 2024, 13),
    ).rejects.toBeInstanceOf(RangeError);
    expect(calls.length).toBe(0);
  });
});

describe("ChessComClient.streamPlayerGames", () => {
  const routes = () => ({
    [ARCHIVES_URL]: { archives: [JAN_URL, FEB_URL] },
    [JAN_URL]: {
      games: [makeGame({ url: "jan-a" }), makeGame({ url: "jan-b" })],
    },
    [FEB_URL]: { games: [makeGame({ url: "feb-a" })] },
  });

  async function collect(stream: AsyncIterable<{ url: string }>) {
    const urls: string[] = [];
    for await (const game of stream) urls.push(game.url);
    return urls;
  }

  it("yields newest-first across months by default", async () => {
    const { fn } = routedFetch(routes());
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const urls = await collect(client.streamPlayerGames("erik"));

    expect(urls).toEqual(["feb-a", "jan-b", "jan-a"]);
  });

  it("yields oldest-first when asked", async () => {
    const { fn } = routedFetch(routes());
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const urls = await collect(
      client.streamPlayerGames("erik", { order: "oldest-first" }),
    );

    expect(urls).toEqual(["jan-a", "jan-b", "feb-a"]);
  });

  it("only fetches months within the since/until window", async () => {
    const { fn, requested } = routedFetch(routes());
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const urls = await collect(
      client.streamPlayerGames("erik", { since: "2024-02" }),
    );

    expect(urls).toEqual(["feb-a"]);
    expect(requested).toContain(FEB_URL);
    expect(requested).not.toContain(JAN_URL);
  });

  it("applies the timeClass filter", async () => {
    const { fn } = routedFetch({
      [ARCHIVES_URL]: { archives: [JAN_URL] },
      [JAN_URL]: {
        games: [
          makeGame({ url: "bullet-1", time_class: "bullet" }),
          makeGame({ url: "blitz-1", time_class: "blitz" }),
        ],
      },
    });
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const urls = await collect(
      client.streamPlayerGames("erik", { timeClass: "blitz" }),
    );

    expect(urls).toEqual(["blitz-1"]);
  });
});

describe("ChessComClient.getPlayerArchives", () => {
  it("unwraps the archives wrapper into a string array", async () => {
    const { fn, calls } = mockFetch(() =>
      json({
        archives: ["https://api.chess.com/pub/player/erik/games/2024/01"],
      }),
    );
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const archives = await client.getPlayerArchives("erik");

    expect(calls[0]?.url).toBe(
      "https://api.chess.com/pub/player/erik/games/archives",
    );
    expect(archives).toEqual([
      "https://api.chess.com/pub/player/erik/games/2024/01",
    ]);
  });
});

describe("ChessComClient clubs", () => {
  it("getClub builds the URL and returns the profile", async () => {
    const { fn, calls } = mockFetch(() => json(clubProfile));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const club = await client.getClub("chess-com-developer-community");

    expect(calls[0]?.url).toBe(
      "https://api.chess.com/pub/club/chess-com-developer-community",
    );
    expect(club.club_id).toBe(clubProfile.club_id);
  });

  it("getClubMembers returns the activity groups", async () => {
    const { fn } = mockFetch(() => json(clubMembers));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const members = await client.getClubMembers("team-usa");

    expect(members.weekly.length).toBe(clubMembers.weekly.length);
  });

  it("getPlayerClubs unwraps to an array", async () => {
    const { fn } = mockFetch(() => json(playerClubs));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const clubs = await client.getPlayerClubs("erik");

    expect(Array.isArray(clubs)).toBe(true);
    expect(clubs.length).toBe(playerClubs.clubs.length);
  });
});

describe("ChessComClient tournaments", () => {
  it("getTournament builds the URL and returns the tournament", async () => {
    const { fn, calls } = mockFetch(() => json(tournament));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const result = await client.getTournament("some-tournament-id");

    expect(calls[0]?.url).toBe(
      "https://api.chess.com/pub/tournament/some-tournament-id",
    );
    expect(result.name).toBe(tournament.name);
  });

  it("getPlayerTournaments returns the grouped participation", async () => {
    const { fn } = mockFetch(() => json(playerTournaments));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const result = await client.getPlayerTournaments("erik");

    expect(result.finished?.length).toBe(playerTournaments.finished.length);
  });
});

describe("ChessComClient global endpoints", () => {
  it("getLeaderboards builds the URL and returns the boards", async () => {
    const { fn, calls } = mockFetch(() => json(leaderboards));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const lb = await client.getLeaderboards();

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/leaderboards");
    expect((lb.live_blitz?.length ?? 0) > 0).toBe(true);
  });

  it("getStreamers unwraps to an array", async () => {
    const { fn } = mockFetch(() => json(streamers));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const list = await client.getStreamers();

    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(streamers.streamers.length);
  });

  it("getDailyPuzzle and getRandomPuzzle hit the right URLs", async () => {
    const { fn, calls } = mockFetch(() => json(puzzle));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await client.getDailyPuzzle();
    await client.getRandomPuzzle();

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/puzzle");
    expect(calls[1]?.url).toBe("https://api.chess.com/pub/puzzle/random");
  });

  it("country profile, players, and clubs", async () => {
    const { fn, calls } = mockFetch((url) => {
      if (url.endsWith("/players")) return json(countryPlayers);
      if (url.endsWith("/clubs")) return json(countryClubs);
      return json(country);
    });
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const profile = await client.getCountry("IS");
    const players = await client.getCountryPlayers("IS");
    const clubs = await client.getCountryClubs("IS");

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/country/IS");
    expect(profile.code).toBe(country.code);
    expect(players).toEqual(countryPlayers.players);
    expect(clubs).toEqual(countryClubs.clubs);
  });
});

describe("ChessComClient matches", () => {
  it("getPlayerMatches builds the URL and returns grouped matches", async () => {
    const { fn, calls } = mockFetch(() => json(playerMatches));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const m = await client.getPlayerMatches("erik");

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/player/erik/matches");
    expect(Array.isArray(m.finished)).toBe(true);
  });

  it("getClubMatches builds the URL", async () => {
    const { fn, calls } = mockFetch(() => json(clubMatches));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await client.getClubMatches("team-usa");

    expect(calls[0]?.url).toBe(
      "https://api.chess.com/pub/club/team-usa/matches",
    );
  });

  it("getMatch builds the URL and returns the match", async () => {
    const { fn, calls } = mockFetch(() => json(match));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const m = await client.getMatch(642370);

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/match/642370");
    expect(m.name).toBe(match.name);
  });

  it("getMatchBoard builds the id/board URL", async () => {
    const { fn, calls } = mockFetch(() => json(matchBoard));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await client.getMatchBoard(642370, 29);

    expect(calls[0]?.url).toBe("https://api.chess.com/pub/match/642370/29");
  });
});

describe("ChessComClient validation modes", () => {
  const garbage = { player_id: "not-a-number" };

  it("throws a ValidationError by default", async () => {
    const { fn } = mockFetch(() => json(garbage));
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    await expect(client.getPlayer("erik")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('returns the raw body when mode is "ignore"', async () => {
    const { fn } = mockFetch(() => json(garbage));
    const client = new ChessComClient({
      userAgent: UA,
      fetch: fn,
      onValidationError: "ignore",
    });

    await expect(client.getPlayer("erik")).resolves.toEqual(garbage);
  });

  it('warns but resolves when mode is "warn"', async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fn } = mockFetch(() => json(garbage));
    const client = new ChessComClient({
      userAgent: UA,
      fetch: fn,
      onValidationError: "warn",
    });

    await expect(client.getPlayer("erik")).resolves.toEqual(garbage);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("ChessComClient caching", () => {
  it("revalidates with the stored ETag and serves the cached body on 304", async () => {
    let calls = 0;
    const fn = vi.fn((_url: string, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(erikProfile), {
            status: 200,
            headers: { etag: '"v1"' },
          }),
        );
      }
      const headers = init?.headers as Record<string, string>;
      expect(headers["If-None-Match"]).toBe('"v1"');
      return Promise.resolve(new Response(null, { status: 304 }));
    }) as unknown as typeof fetch;
    const client = new ChessComClient({ userAgent: UA, fetch: fn });

    const first = await client.getPlayer("erik");
    const second = await client.getPlayer("erik");

    expect(second).toEqual(first);
    expect(calls).toBe(2);
  });
});

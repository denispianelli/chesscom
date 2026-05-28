import { afterEach, describe, expect, it, vi } from "vitest";
import erikProfile from "../test/fixtures/player-erik.json";
import erikGames from "../test/fixtures/games-erik-2024-01.json";
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

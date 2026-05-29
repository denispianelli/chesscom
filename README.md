# @dpianelli/chesscom

> **Unofficial** TypeScript SDK for the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
> Not affiliated with, endorsed by, or sponsored by Chess.com.

A clean, typed, isomorphic client for the public Chess.com API — with built-in
rate limiting, ETag caching, runtime response validation, and lazy pagination.

- ✅ Typed responses, validated at runtime with [zod](https://zod.dev)
- ✅ Serial rate limiting + backoff (respects the Chess.com "be serial" rule)
- ✅ Transparent ETag caching (`304 Not Modified` aware)
- ✅ Lazy async iteration over monthly game archives
- ✅ Isomorphic — native `fetch`, runs in Node 18+, Deno, Bun, the browser
- ✅ One dependency (`zod`)

> ⚠️ Work in progress. The API is not stable until `1.0.0`.

## Install

```bash
npm install @dpianelli/chesscom
```

## Quickstart

```ts
import { ChessComClient } from "@dpianelli/chesscom";

const client = new ChessComClient({
  // Required by Chess.com — include an app name and a contact.
  userAgent: "myapp/1.0 (me@example.com)",
});

const profile = await client.getPlayer("hikaru");
const stats = await client.getPlayerStats("hikaru");

// Lazily stream a player's games across monthly archives:
for await (const game of client.streamPlayerGames("hikaru", {
  since: "2024-01",
})) {
  console.log(game.url, game.pgn);
}
```

## Why a `userAgent` is required

Chess.com rejects requests without a descriptive `User-Agent` (HTTP 403) and asks
that you include a way to contact you. The client therefore **requires** it at
construction. Use `"<app>/<version> (<contact>)"`, e.g.
`"my-bot/1.0 (me@example.com)"`.

> Note: in browsers, `fetch` ignores a custom `User-Agent` (it is a forbidden
> header). The option only takes effect on Node, Deno, and Bun.

## API

All methods return validated, fully typed results.

| Method                                  | Returns                | Endpoint                               |
| --------------------------------------- | ---------------------- | -------------------------------------- |
| `getPlayer(username)`                   | `PlayerProfile`        | `/player/{username}`                   |
| `getPlayerStats(username)`              | `PlayerStats`          | `/player/{username}/stats`             |
| `getPlayerArchives(username)`           | `string[]`             | `/player/{username}/games/archives`    |
| `getPlayerGames(username, year, month)` | `Game[]`               | `/player/{username}/games/{YYYY}/{MM}` |
| `streamPlayerGames(username, options?)` | `AsyncGenerator<Game>` | iterates over the monthly archives     |
| `getPlayerClubs(username)`              | `PlayerClub[]`         | `/player/{username}/clubs`             |
| `getPlayerTournaments(username)`        | `PlayerTournaments`    | `/player/{username}/tournaments`       |
| `getClub(urlId)`                        | `ClubProfile`          | `/club/{url-id}`                       |
| `getClubMembers(urlId)`                 | `ClubMembers`          | `/club/{url-id}/members`               |
| `getTournament(urlId)`                  | `Tournament`           | `/tournament/{url-id}`                 |
| `getLeaderboards()`                     | `Leaderboards`         | `/leaderboards`                        |
| `getStreamers()`                        | `Streamer[]`           | `/streamers`                           |
| `getDailyPuzzle()`                      | `Puzzle`               | `/puzzle`                              |
| `getRandomPuzzle()`                     | `Puzzle`               | `/puzzle/random`                       |
| `getCountry(iso)`                       | `Country`              | `/country/{iso}`                       |
| `getCountryPlayers(iso)`                | `string[]`             | `/country/{iso}/players`               |
| `getCountryClubs(iso)`                  | `string[]`             | `/country/{iso}/clubs`                 |

Each method also accepts a final options object with an `AbortSignal`:

```ts
const controller = new AbortController();
const profile = await client.getPlayer("hikaru", { signal: controller.signal });
```

### `streamPlayerGames`

Hides the monthly pagination: it lists the archives, then fetches one month at a
time (lazily) and yields game by game. The rate limiter and cache apply per
month, so re-runs are fast and polite.

```ts
for await (const game of client.streamPlayerGames("hikaru", {
  since: "2024-01", // YYYY-MM, inclusive
  until: "2024-12", // YYYY-MM, inclusive
  order: "newest-first", // or "oldest-first" (default: newest-first)
  timeClass: "blitz", // keep only blitz games
  rated: true, // keep only rated games
})) {
  // …
}
```

Months outside the `since`/`until` window are never requested.

### Parsing PGN

Games expose their **raw PGN** as a string — this SDK does not parse moves, so you
can pair it with whatever chess library you prefer. For example, with
[chess.js](https://github.com/jhlywa/chess.js):

```ts
import { Chess } from "chess.js";

const games = await client.getPlayerGames("hikaru", 2024, 1);
const game = games[0];

if (game?.pgn) {
  const chess = new Chess();
  chess.loadPgn(game.pgn);
  console.log(chess.history()); // ["e4", "c5", "Nf3", …]
  console.log(chess.header()); // { White, Black, Result, ECO, … }
}
```

(Header fields like `white`, `black`, `time_control`, `eco`, and `end_time` are
also available as structured fields on the `Game` object, no parsing needed.)

## Configuration

```ts
new ChessComClient({
  userAgent: "myapp/1.0 (me@example.com)", // required
  fetch, // custom fetch (default: global fetch)
  cache, // custom CacheStore (default: in-memory Map)
  timeout: 10_000, // per-request timeout in ms (default: none)
  baseUrl: "https://api.chess.com/pub", // default
  onValidationError: "throw", // "throw" | "warn" | "ignore" (default: "throw")
  onRateLimit: (info) => console.warn("rate limited", info),
});
```

## Error handling

Every error thrown by the SDK extends `ChessComError` and carries a discriminant
`kind`. Branch with `instanceof` or `switch (err.kind)`.

```ts
import { ChessComError, NotFoundError } from "@dpianelli/chesscom";

try {
  await client.getPlayer("does-not-exist");
} catch (err) {
  if (err instanceof NotFoundError) {
    // …
  } else if (err instanceof ChessComError) {
    console.error(err.kind, err.status, err.url);
  }
}
```

| Error             | `kind`       | When                                           |
| ----------------- | ------------ | ---------------------------------------------- |
| `NotFoundError`   | `not_found`  | HTTP 404 / 410                                 |
| `RateLimitError`  | `rate_limit` | HTTP 429 after retries are exhausted           |
| `ForbiddenError`  | `forbidden`  | HTTP 403 (often a missing/rejected User-Agent) |
| `ServerError`     | `server`     | HTTP 5xx or an unexpected status               |
| `ValidationError` | `validation` | A response did not match its schema            |
| `NetworkError`    | `network`    | The request never produced a response          |

## Validation

Responses are validated against zod schemas. If the API drifts from the expected
shape, `onValidationError` decides what happens:

- `"throw"` (default) — throw a `ValidationError`.
- `"warn"` — log a warning and return the raw data.
- `"ignore"` — return the raw data silently.

## Rate limiting

Chess.com asks clients to make requests serially (parallel requests get a 429).
By default the client funnels all requests through a serial queue and retries a
429 with exponential backoff, honoring the server's `Retry-After`. This is
per-client instance; share one client to share the queue.

## Caching

The client revalidates with ETags (`If-None-Match`) and serves the cached body on
`304 Not Modified`. The default store is an in-memory `Map`. Plug in your own by
implementing `CacheStore`:

```ts
import type { CacheStore, CacheEntry } from "@dpianelli/chesscom";

class RedisCacheStore implements CacheStore {
  constructor(private redis: import("ioredis").Redis) {}

  async get(key: string): Promise<CacheEntry | undefined> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as CacheEntry) : undefined;
  }

  async set(key: string, value: CacheEntry): Promise<void> {
    await this.redis.set(key, JSON.stringify(value));
  }
}

const client = new ChessComClient({
  userAgent: "myapp/1.0 (me@example.com)",
  cache: new RedisCacheStore(redis),
});
```

## Requirements

- The published library runs on **Node 18+**, Deno, Bun, and browsers (anything
  with a global `fetch`).
- Contributing to this repo requires **Node 22+** (the dev toolchain).

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Documentation

- [`SPEC.md`](./SPEC.md) — technical design and architecture
- [`STYLE.md`](./STYLE.md) — code conventions
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — how to contribute
- [`RELEASING.md`](./RELEASING.md) — release & publish process

## License

[MIT](./LICENSE)

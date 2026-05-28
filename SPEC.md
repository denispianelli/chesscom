# `@dpianelli/chesscom` — Technical spec

> Unofficial TypeScript SDK for the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
> Not affiliated with, endorsed by, or sponsored by Chess.com.

This document records the design decisions made during the initial brainstorm.
It is the reference during implementation. Any deviation must be a deliberate
choice, not drift.

---

## 1. Project identity

| Aspect         | Decision                                                    |
| -------------- | ----------------------------------------------------------- |
| **npm name**   | `@dpianelli/chesscom` (scope = npm username `dpianelli`)    |
| **Language**   | TypeScript, isomorphic (Node 18+, Deno, Bun, browser)       |
| **Runtime**    | native global `fetch` — no HTTP library                     |
| **Dependency** | **Exactly one: `zod`** (runtime response validation)        |
| **Ambition**   | A serious, publishable library: tests, CI, docs, semver     |
| **v1 scope**   | **Player-first** — the whole player surface, the rest later |
| **License**    | MIT                                                         |

**Discoverability + trademark**: "chesscom" is in the name (→ npm search) and the
`@dpianelli/` scope clearly signals the unofficial nature (→ covers trademark
risk). Reinforced via `keywords` + a README disclaimer.

```jsonc
// package.json
"keywords": ["chess.com", "chesscom", "chess", "chess-api", "api", "sdk", "typescript"]
```

---

## 2. Design principles

1. **Raw PGN.** Games expose their PGN as a `string` (+ JSDoc), plus the
   structured fields the API already provides (`white`, `black`, `time_control`,
   `eco`, `end_time`, …). **No move parsing** — the consumer plugs in their own
   library (`chess.js`, `@mliebelt/pgn-parser`, etc.).
2. **A single internal HTTP layer.** Transport + rate-limit + cache + retry. The
   resources (endpoints) are thin functions on top of it.
3. **No global magic.** `new ChessComClient(opts)`; everything is injectable
   (fetch, cache, transport). No implicit singletons → testable.
4. **Mandatory `User-Agent`** at construction. Chess.com returns `403` without
   one and recommends a contact. The SDK **forces** it (not a forgettable option).

---

## 3. Architecture — Pragmatic hexagonal

Dependency rule: **the core depends on nothing; details depend on the core.**
We take the one clean-architecture principle that pays off in an SDK (ports &
adapters, pure domain, injection) and **none of the useless ceremony** (no
use-case layer, no DTO↔entity mapping when the API already returns the right
shape).

> **Anti-over-engineering rule:** add a layer only when it absorbs a real
> variation. The HTTP port absorbs "fetch vs mock vs other runtime" → justified.
> A use-case layer would absorb nothing → we skip it.

```
┌─────────────────────────────────────────────────────────┐
│  domain/            the core — ZERO external dependency    │
│   • domain types: Player, Game, Stats, …                  │
│   • errors: ChessComError & subtypes                      │
│   • ports (interfaces): HttpTransport, CacheStore         │
├─────────────────────────────────────────────────────────┤
│  application/       orchestration — depends on domain      │
│   • resources/player.ts: composes the ports               │
│   • lazy pagination (streamPlayerGames)                   │
├─────────────────────────────────────────────────────────┤
│  infrastructure/    adapters — depends on domain           │
│   • FetchTransport       implements HttpTransport         │
│   • RateLimiter          decorates the transport          │
│   • EtagCache            implements the caching decorator │
│   • schemas/ (zod) + domain type derivation               │
├─────────────────────────────────────────────────────────┤
│  client.ts          composition root — wires everything    │
└─────────────────────────────────────────────────────────┘
```

**Reading the rule:** `application` and `infrastructure` know `domain`. `domain`
knows no one. `client.ts` is the only place that knows everyone and injects.
Consequence: **zod and fetch are replaceable details**, confined to
`infrastructure/`. The core does not move if we swap them.

**Decorators over inheritance** for cross-cutting concerns:
`FetchTransport` → wrapped by `EtagCache` → wrapped by `RateLimiter`.
Each has a single responsibility and is tested in isolation.

### Target tree

```
src/
  domain/
    player.ts          // types Player, Stats, Game…
    errors.ts          // ChessComError + subtypes
    ports.ts           // HttpTransport, CacheStore (interfaces)
  application/
    resources/
      player.ts        // player endpoint logic (v1)
  infrastructure/
    transport/
      fetch-transport.ts
      rate-limiter.ts
      etag-cache.ts
    schemas/
      player.ts        // zod schemas + z.infer → domain types
  client.ts            // composition root
  index.ts             // public surface
test/
  fixtures/            // real captured JSON responses
  ...                  // a mirroring test file per module
```

---

## 4. Public surface (flat methods)

```ts
import { ChessComClient } from "@dpianelli/chesscom";

const client = new ChessComClient({
  userAgent: "myapp/1.0 (me@example.com)", // MANDATORY
  fetch,                                    // optional (test injection)
  cache,                                    // optional (default: in-memory Map)
  timeout: 10_000,                          // optional, ms, per request
  onValidationError: "throw",               // 'throw' | 'warn' | 'ignore'
  onRateLimit: (info) => {},                // observability hook
});

// --- v1: player surface ---
client.getPlayer(username);                   // profile
client.getPlayerStats(username);              // ratings (blitz, rapid, bullet, daily, tactics…)
client.getPlayerArchives(username);           // list of available months
client.getPlayerGames(username, year, month); // games for one month
client.streamPlayerGames(username, opts?);    // async iterator (lazy, paginated)
client.getPlayerClubs(username);
client.isPlayerOnline(username);
```

### `streamPlayerGames` — the signature helper

Hides monthly pagination. Iterates over the archives, fetches one month at a
time (lazily), yields game by game. The rate limiter + cache make this both
polite and fast on re-runs.

```ts
for await (const game of client.streamPlayerGames("hikaru", {
  since: "2024-01",
})) {
  // …
}
```

- **Default order**: newest → oldest (the most common use case). `order` option.
- **Filters**: `since` / `until` (by `YYYY-MM` month), `timeClass`, `rated`.

### Out-of-v1 endpoints (backlog)

`getClub`, `getClubMembers`, `getTournament`, `getLeaderboards`,
`getCountryPlayers`, `getStreamers`, `getDailyPuzzle`.

---

## 5. HTTP core

### Rate limiter

Chess.com rule: **serial is fine, parallel → 429** (no published numeric quota).

- FIFO queue, **concurrency = 1 by default**.
- Exponential backoff + jitter on `429`, honoring the `Retry-After` header.
- `onRateLimit` hook (observability, not a black box).
- **Decision**: per-instance, not a process-wide singleton — that would be the
  implicit global state the design rules forbid. Cross-client coordination is
  opt-in by sharing a `RateLimiter` instance.

### ETag cache

```ts
interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, value: CacheEntry): Promise<void>;
}
```

- Key = request URL.
- Sends `If-None-Match: <etag>`. On `304`, returns the cached body — already
  parsed (we cache the validated object, not the raw JSON → perf gain).
- Default: in-memory `Map`. Pluggable (Redis, filesystem, …).
- **No TTL**: closed archives are immutable; for everything else the server
  decides freshness via `304`. We do not reinvent expiration.
- **Best-effort**: a failing store degrades to a miss (read) or a no-op (write)
  and never turns into a failed request.

### Zod validation

- Every response runs through a zod schema **by default**.
- `onValidationError: 'throw' | 'warn' | 'ignore'` (default `'throw'`). Chess.com
  has no API versioning → if a field drifts, the consumer chooses the behavior.

### Timeout & cancellation

- Per-request `timeout` via `AbortSignal`.
- Also accepts a caller-supplied `signal`.

---

## 6. Errors

Hierarchy discriminable by `.kind`, thrown (no `Result`).

```
ChessComError { kind, status?, url }
 ├─ NotFoundError      // 404 / 410 (missing player / club)
 ├─ RateLimitError     // 429 (retries exhausted)
 ├─ ForbiddenError     // 403 (missing / rejected User-Agent)
 ├─ ServerError        // 5xx / unexpected status
 ├─ ValidationError    // response outside the zod schema
 └─ NetworkError       // fetch threw (offline, timeout)
```

```ts
try {
  await client.getPlayer("ghost-user");
} catch (e) {
  if (e instanceof ChessComError && e.kind === "not_found") {
    /* … */
  }
}
```

---

## 7. Tests

Strategy: **fetch mocks + fixtures**, no network-mocking library.

- `ChessComClient` accepts a custom `fetch` → we inject a fake in tests.
  Consistent with "zero dependency"; exercises the architecture via injection (DIP).
- `test/fixtures/`: real JSON responses captured once (profile, archive, 404,
  429 + `Retry-After`, 304, …).
- **What we actually test (core behavior, not just parsing)**:
  - the rate limiter **serializes** (2 concurrent calls → run in series);
  - backoff **honors `Retry-After`** and retries on 429;
  - the cache returns the body on **304** and sends `If-None-Match`;
  - **typed errors** are thrown (404 → `NotFoundError`, etc.);
  - the **`User-Agent`** is present on every request;
  - zod validation rejects a corrupted fixture.

---

## 8. Quality & tooling

- **Build**: `tsup` (JS, ESM + CJS) + `tsc` for `.d.ts` (decoupled — TS 6
  deprecates the `baseUrl` that rollup-plugin-dts injects).
- **Tests**: `vitest`.
- **Lint/format**: strict `typescript-eslint` + Prettier — **blocking in CI**.
- **Git hooks** (husky): pre-commit (lint-staged), commit-msg (commitlint,
  Conventional Commits), pre-push (typecheck + test).
- **CI**: GitHub Actions on a Node `[22, 24]` matrix. The dev toolchain requires
  Node 22+; the published library still targets Node 18+ at runtime.
- **Docs**: TSDoc across the public surface → TypeDoc generation.
- **Versioning**: semver. Chess.com has no API versioning → the SDK's breaking
  changes are ours, so strict semver.
- See `STYLE.md` for code and naming conventions.

---

## 9. Decision status

✅ All structural decisions are made (language, architecture, surface, core,
errors, tests, name). Points deliberately left to implementation:

- ETag cache placement: inside the rate limiter (revalidation always hits the
  network), decided during the core build.
- Player schemas hand-written from real captures (no OpenAPI spec exists).

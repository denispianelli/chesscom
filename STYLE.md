# `@dpianelli/chesscom` — Conventions (clean code)

This document sets the code conventions that keep the project clean and
consistent over time. Guiding principle: **clean, not ceremonious.** We prefer
simple, readable code over impressive abstractions.

---

## 1. Dependency rule (the most important one)

The architecture is pragmatic hexagonal (see `SPEC.md` §3). One rule never to
break:

> **`domain/` depends on nothing. `application/` and `infrastructure/` depend on
> `domain/`. Only `client.ts` (composition root) knows everyone.**

Concretely:

- `domain/` **never** imports `zod`, `fetch`, or an `infrastructure/` module.
- A resource (`application/`) depends on the `HttpTransport` interface, **never**
  on `FetchTransport` directly.
- Zod schemas live in `infrastructure/schemas/` and _produce_ the domain types
  (`z.infer`); they are not _themselves_ the domain.

When unsure whether to add a layer or an abstraction: **add it only if it
absorbs a real variation.** Otherwise, don't.

---

## 2. Naming

| Element               | Convention                  | Example                           |
| --------------------- | --------------------------- | --------------------------------- |
| Read methods          | `getX`                      | `getPlayer`, `getPlayerStats`     |
| Streaming methods     | `streamX`                   | `streamPlayerGames`               |
| Predicates            | `isX` / `hasX`              | `isPlayerOnline`                  |
| Ports (interfaces)    | `XxxTransport` / `XxxStore` | `HttpTransport`, `CacheStore`     |
| Adapters (port impls) | the concrete detail name    | `FetchTransport`, `EtagCache`     |
| Errors                | `XxxError`                  | `NotFoundError`, `RateLimitError` |
| Types/interfaces      | `PascalCase`                | `Player`, `GameArchive`           |
| Files                 | `kebab-case.ts`             | `fetch-transport.ts`              |
| Variables/functions   | `camelCase`                 | `playerName`, `buildUrl`          |

- No obscure abbreviations. `username` not `un`, `response` not `res` (except
  ultra-established idioms).
- A name must convey intent. If you need a comment to explain what a variable
  is, rename it.

---

## 3. Functions & files

- **One responsibility per file**: one reason to change. The rate limiter knows
  nothing about the cache; the cache knows nothing about players.
- Short, focused functions. If a function does three things, split it.
- No positional boolean parameters that flip behavior — prefer a named options
  object.
- Avoid deep nesting: early-return over nested `if`s.

---

## 4. Types

- **`strict: true`** in `tsconfig`. No compromise.
- **No `any`.** `unknown` + narrowing when the type is genuinely indeterminate
  (e.g. a cached body). Lint: `no-explicit-any` enabled.
- Public types are derived from the zod schemas (`z.infer`) and re-exported from
  `index.ts` — a single source of truth.
- `PGN` is a documented `string` (JSDoc), not a branded type (needless friction
  for raw PGN).
- Public return types are **explicit** (`explicit-module-boundary-types`).

---

## 5. Errors

- We `throw` subtypes of `ChessComError` (no `Result`).
- Every error carries `kind` (discriminant), `url`, and `status` when relevant.
- Never swallow an error silently. If we `ignore` (validation mode), that is an
  explicit, documented consumer choice via `onValidationError`.
- Never `throw` strings or bare objects — always an `Error` instance.

---

## 6. Async

- `async/await` everywhere, never chained `.then()` in business logic.
- Lint: `no-floating-promises` enabled — every promise is awaited or explicitly
  handled.
- Streaming uses async generators (`async function*`).
- Honor `AbortSignal` everywhere a network request is made.

---

## 7. Tests

- **Unit tests are co-located** with the code they cover: `foo.ts` →
  `foo.test.ts`. They run on every `npm test` and in CI.
- **Integration tests live under `test/integration/`** and hit the live API.
  They are excluded from `npm test`/CI and run on demand via
  `npm run test:integration`.
- Deterministic unit tests: injected `fetch` + fixtures, **no network in CI**.
- We test **behavior** (serialization, backoff, 304, typed errors), not private
  implementation details.
- Realistic fixtures captured from the real API, stored in `test/fixtures/`.
- Name tests by expected behavior: `it("serializes concurrent requests")`, not
  `it("test rate limiter")`.

---

## 8. Documentation

- **TSDoc** on every public element (classes, methods, exported types) — consumed
  by TypeDoc to generate the API docs.
- A short example in the TSDoc of the main methods.
- No comments that restate the code. Comment the _why_, never the _what_.
- README opens with the unofficial disclaimer, then quickstart, then the API
  surface.

---

## 9. Lint & format (automated guardrail)

Clean code not enforced by the machine always drifts. Therefore:

- `typescript-eslint` in strict config: `no-explicit-any`, `no-floating-promises`,
  `explicit-module-boundary-types`, `no-unused-vars`, etc.
- Prettier for formatting (zero style debate).
- Both are **blocking in CI**, and run locally via the pre-commit hook
  (lint-staged) and the `check` script (which mirrors CI exactly).

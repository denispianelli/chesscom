# Contributing

Thanks for your interest in `@dpianelli/chesscom`! This is an unofficial,
community SDK for the Chess.com Published-Data API.

## Prerequisites

- **Node 22+** (the dev toolchain — lint-staged and commitlint require it). The
  published library itself runs on Node 18+.
- npm (bundled with Node).

## Setup

```bash
npm install
```

This also installs the Git hooks (via the `prepare` script / husky).

## Development loop

```bash
npm run check        # lint + format check + typecheck + unit tests (mirrors CI)
npm run test:watch   # tests in watch mode
npm run build        # bundle (tsup) + type declarations (tsc)
```

`npm run check` is exactly what CI runs — keep it green.

### Integration tests

A separate suite hits the **live** Chess.com API. It is not part of `npm test`
or CI (network, rate limits, third-party availability). Run it manually:

```bash
npm run test:integration
```

Its purpose is to confirm the hand-written zod schemas still match the API's
current responses.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
and are enforced by commitlint (the `commit-msg` hook). Use a lowercase subject:

```
feat: add getCountryPlayers
fix: handle 410 as not found
docs: clarify the userAgent requirement
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`. A `feat`
bumps the minor version, a `fix` the patch; mark breaking changes with `!` or a
`BREAKING CHANGE:` footer (see [`RELEASING.md`](./RELEASING.md)).

## Git hooks

- **pre-commit** — `lint-staged` runs ESLint `--fix` + Prettier on staged files.
- **commit-msg** — commitlint validates the message.
- **pre-push** — typecheck + unit tests.

## Pull requests

- Branch from `main`, open a PR back to `main`.
- CI must pass (lint, format, typecheck, test, build on Node 22 and 24).
- Match the surrounding code; see [`STYLE.md`](./STYLE.md) for conventions and
  [`SPEC.md`](./SPEC.md) for the architecture.

## Adding an endpoint

1. Capture a real response and add a trimmed fixture under `test/fixtures/`.
2. Write the zod schema in `src/infrastructure/schemas/` (defensive optionality,
   open enums as `z.string()`), derive the type with `z.infer`.
3. Add a thin `get…`/`stream…` method on `ChessComClient`.
4. Add schema tests (validate the fixture, reject malformed input) and a client
   test, plus a line in the live integration suite.
5. Export the new types from `src/index.ts` and update the README API table.

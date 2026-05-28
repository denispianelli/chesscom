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

> ⚠️ Work in progress. API not stable until `1.0.0`.

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

const player = await client.getPlayer("hikaru");
const stats = await client.getPlayerStats("hikaru");

for await (const game of client.streamPlayerGames("hikaru", {
  since: "2024-01",
})) {
  console.log(game.url);
}
```

## Documentation

- [`SPEC.md`](./SPEC.md) — technical design and architecture
- [`STYLE.md`](./STYLE.md) — code conventions

## License

[MIT](./LICENSE)

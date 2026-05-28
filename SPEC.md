# `@dpianelli/chesscom` — Spec technique

> Unofficial TypeScript SDK for the [Chess.com Published-Data API](https://www.chess.com/news/view/published-data-api).
> Not affiliated with, endorsed by, or sponsored by Chess.com.

Ce document fige les décisions de design issues du brainstorm initial. Il sert de
référence pendant l'implémentation. Toute déviation doit être un choix conscient,
pas une dérive.

---

## 1. Identité du projet

| Aspect         | Décision                                                         |
| -------------- | ---------------------------------------------------------------- |
| **Nom npm**    | `@dpianelli/chesscom` (scope = username `dpianelli`)             |
| **Langage**    | TypeScript, isomorphe (Node 18+, Deno, Bun, navigateur)          |
| **Runtime**    | `fetch` natif global — pas de lib HTTP                           |
| **Dépendance** | **Une seule : `zod`** (validation runtime des réponses)          |
| **Ambition**   | Librairie publiable sérieuse : tests, CI, docs, semver           |
| **Scope v1**   | **Player-first** — tout l'univers joueur, le reste vient ensuite |
| **Licence**    | MIT (à confirmer)                                                |

**Découvrabilité + marque** : « chesscom » est dans le nom (→ recherche npm) et le
scope `@dpianelli/` signale clairement le caractère non-officiel (→ couvre le risque
de marque). Renforcer via `keywords` + disclaimer README.

```jsonc
// package.json
"keywords": ["chess.com", "chesscom", "chess", "chess-api", "api", "sdk", "typescript"]
```

---

## 2. Principes de design

1. **PGN brut.** Les parties exposent leur PGN comme `string` (+ JSDoc), plus les
   champs structurés déjà fournis par l'API (`white`, `black`, `time_control`,
   `eco`, `end_time`…). **Aucun parsing de coups** — l'utilisateur branche sa
   propre lib (`chess.js`, `@mliebelt/pgn-parser`, etc.).
2. **Une seule couche HTTP interne.** Transport + rate-limit + cache + retry. Les
   resources (endpoints) sont des fonctions minces au-dessus.
3. **Pas de magie globale.** `new ChessComClient(opts)` ; tout est injectable
   (fetch, cache, transport). Aucun singleton implicite → testable.
4. **`User-Agent` obligatoire** à l'instanciation. Chess.com renvoie `403` sinon, et
   recommande un contact. Le SDK le **force** (pas une option oubliable).

---

## 3. Architecture — Hexagonal pragmatique

Règle de dépendance : **le cœur ne dépend de rien ; les détails dépendent du cœur.**
On prend le seul principe de clean archi qui paie sur un SDK (ports & adapters,
domain pur, injection) et **rien de la ceremony inutile** (pas de couche use-case,
pas de mapping DTO↔entity quand l'API renvoie déjà la bonne forme).

> **Règle d'or anti-sur-architecture :** on n'ajoute une couche que quand elle
> absorbe une vraie variation. Le port HTTP absorbe « fetch vs mock vs autre
> runtime » → justifié. Une couche use-case n'absorberait rien → on s'en passe.

```
┌─────────────────────────────────────────────────────────┐
│  domain/            le cœur — ZÉRO dépendance externe      │
│   • types métier : Player, Game, Stats, …                 │
│   • erreurs : ChessComError & sous-types                  │
│   • ports (interfaces) : HttpTransport, CacheStore        │
├─────────────────────────────────────────────────────────┤
│  application/       orchestration — dépend de domain       │
│   • resources/player.ts : compose les ports               │
│   • pagination paresseuse (streamPlayerGames)             │
├─────────────────────────────────────────────────────────┤
│  infrastructure/    adapters — dépend de domain            │
│   • FetchTransport       implémente HttpTransport         │
│   • RateLimiter          décore le transport              │
│   • EtagCache            implémente CacheStore            │
│   • schemas/ (zod) + dérivation des types domain          │
├─────────────────────────────────────────────────────────┤
│  client.ts          composition root — câble tout          │
└─────────────────────────────────────────────────────────┘
```

**Lecture de la règle :** `application` et `infrastructure` connaissent `domain`.
`domain` ne connaît personne. `client.ts` est le seul point qui connaît tout le
monde et qui injecte. Conséquence : **zod et fetch sont des détails remplaçables**,
confinés à `infrastructure/`. Le cœur ne bouge pas si on les change.

**Décorateurs plutôt qu'héritage** pour le cross-cutting :
`FetchTransport` → enveloppé par `EtagCache` → enveloppé par `RateLimiter`.
Chacun a une seule responsabilité et se teste isolément.

### Arborescence cible

```
src/
  domain/
    player.ts          // types Player, Stats, Game…
    errors.ts          // ChessComError + sous-types
    ports.ts           // HttpTransport, CacheStore (interfaces)
  application/
    resources/
      player.ts        // logique des endpoints joueur (v1)
  infrastructure/
    transport/
      fetch-transport.ts
      rate-limiter.ts
      etag-cache.ts
    schemas/
      player.ts        // schémas zod + z.infer → types domain
  client.ts            // composition root
  index.ts             // surface publique
test/
  fixtures/            // réponses JSON réelles capturées
  ...                  // un fichier de test miroir par module
```

---

## 4. Surface publique (méthodes plates)

```ts
import { ChessComClient } from "@dpianelli/chesscom";

const client = new ChessComClient({
  userAgent: "myapp/1.0 (me@example.com)", // OBLIGATOIRE
  fetch,                                    // optionnel (injection test)
  cache,                                    // optionnel (défaut : Map mémoire)
  timeout: 10_000,                          // optionnel, ms, par requête
  onValidationError: "throw",               // 'throw' | 'warn' | 'ignore'
  onRateLimit: (info) => {},                // hook d'observabilité
});

// --- v1 : univers joueur ---
client.getPlayer(username);                   // profil
client.getPlayerStats(username);              // ratings (blitz, rapid, bullet, daily, tactics…)
client.getPlayerArchives(username);           // liste des mois disponibles
client.getPlayerGames(username, year, month); // parties d'un mois
client.streamPlayerGames(username, opts?);    // async iterator (lazy, paginé)
client.getPlayerClubs(username);
client.isPlayerOnline(username);
```

### `streamPlayerGames` — le helper signature

Masque la pagination mensuelle. Itère sur les archives, fetch un mois à la fois
(paresseux), yield partie par partie. Rate-limiter + cache rendent ça poli et rapide
en re-run.

```ts
for await (const game of client.streamPlayerGames("hikaru", {
  since: "2024-01",
})) {
  // …
}
```

- **Ordre par défaut** : récent → ancien (cas d'usage le plus courant). Option `order`.
- **Filtres** : `since` / `until` (par mois `YYYY-MM`), `timeClass`, `rated`.

### Endpoints hors v1 (backlog)

`getClub`, `getClubMembers`, `getTournament`, `getLeaderboards`,
`getCountryPlayers`, `getStreamers`, `getDailyPuzzle`.

---

## 5. Cœur HTTP

### Rate-limiter

Règle chess.com : **sérial OK, parallèle → 429** (pas de quota chiffré).

- File FIFO, **concurrence = 1 par défaut**.
- Backoff exponentiel + jitter sur `429`, respecte l'en-tête `Retry-After`.
- Hook `onRateLimit` (observabilité, pas une boîte noire).
- **À trancher à l'implémentation** : limiter partagé par process (clé = hostname)
  vs par client. Penchant : partagé par défaut, injectable si besoin.

### Cache ETag

```ts
interface CacheStore {
  get(key: string): Promise<{ etag: string; body: unknown } | undefined>;
  set(key: string, value: { etag: string; body: unknown }): Promise<void>;
}
```

- Clé = URL de la requête.
- Envoie `If-None-Match: <etag>`. Sur `304`, renvoie le body caché — **déjà parsé**
  (on cache l'objet validé, pas le JSON brut → gain de perf).
- Défaut : `Map` en mémoire. Pluggable (Redis, fichier…).
- **Pas de TTL** : les archives closes sont immuables ; pour le reste, le serveur
  décide la fraîcheur via `304`. On ne réinvente pas l'expiration.

### Validation Zod

- Chaque réponse passe par un schéma zod **par défaut**.
- `onValidationError: 'throw' | 'warn' | 'ignore'` (défaut `'throw'`). chess.com
  n'a pas de versioning d'API → si un champ dérive, l'utilisateur choisit le
  comportement.

### Timeout & annulation

- `timeout` par requête via `AbortSignal`.
- Accepte aussi un `signal` utilisateur.

---

## 6. Erreurs

Hiérarchie discriminable par `.kind`, `throw` (pas de `Result`).

```
ChessComError { kind, status?, url }
 ├─ NotFoundError      // 404 (joueur / club inexistant)
 ├─ RateLimitError     // 429 (retries épuisés)
 ├─ ForbiddenError     // 403 (User-Agent manquant / refusé)
 ├─ ServerError        // 5xx
 ├─ ValidationError    // réponse hors schéma zod
 └─ NetworkError       // fetch a throw (offline, timeout)
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

Stratégie : **mocks de `fetch` + fixtures**, pas de lib de mock réseau.

- `ChessComClient` accepte un `fetch` custom → on injecte un fake en test.
  Cohérent avec « zéro dépendance », teste l'archi par injection (DIP).
- `test/fixtures/` : réponses JSON réelles capturées une fois (profil, archive,
  404, 429 + `Retry-After`, 304…).
- **Ce qu'on teste vraiment (le comportement du cœur, pas juste le parsing)** :
  - le rate-limiter **sérialise** (2 appels concurrents → exécutés en série) ;
  - le backoff **respecte `Retry-After`** et réessaie sur 429 ;
  - le cache renvoie le body sur **304** et envoie `If-None-Match` ;
  - les **erreurs typées** sont levées (404 → `NotFoundError`, etc.) ;
  - le **`User-Agent`** est présent dans chaque requête ;
  - la **validation zod** rejette une fixture corrompue.

---

## 8. Qualité & tooling

- **Build** : `tsup` (sorties ESM + CJS, types `.d.ts`).
- **Tests** : `vitest`.
- **Lint/format** : `typescript-eslint` strict + Prettier — **bloquants en CI**.
- **CI** : GitHub Actions (lint, test, build sur push/PR).
- **Docs** : TSDoc sur toute la surface publique → génération via TypeDoc.
- **Versioning** : semver. Pas de versioning d'API côté chess.com → les breaking
  changes du SDK viennent de nous, donc semver strict.
- Voir `STYLE.md` pour les conventions de code et de nommage.

---

## 9. Statut des décisions

✅ Toutes les décisions structurantes sont prises (langage, archi, surface, core,
erreurs, tests, nom). Points laissés explicitement à l'implémentation :

- Rate-limiter partagé par process vs par client.
- Licence (MIT par défaut).
- Confirmation finale du username `dpianelli` côté npm (sign-up fait).

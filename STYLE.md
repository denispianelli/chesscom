# `@dpianelli/chesscom` — Conventions (clean code)

Ce document fixe les conventions de code pour garder le projet clean et cohérent
dans le temps. Le principe directeur : **clean, pas cérémonieux.** On préfère du
code simple et lisible à des abstractions impressionnantes.

---

## 1. Règle de dépendance (la plus importante)

L'architecture est hexagonale pragmatique (voir `SPEC.md` §3). Une seule règle à ne
jamais enfreindre :

> **`domain/` ne dépend de rien. `application/` et `infrastructure/` dépendent de
> `domain/`. Seul `client.ts` (composition root) connaît tout le monde.**

Concrètement :

- `domain/` n'importe **jamais** `zod`, `fetch`, ni un module `infrastructure/`.
- Une resource (`application/`) dépend de l'interface `HttpTransport`, **jamais** de
  `FetchTransport` directement.
- Les schémas zod vivent dans `infrastructure/schemas/` et _produisent_ les types du
  domaine (`z.infer`), ils ne _sont_ pas le domaine.

Si tu hésites à ajouter une couche ou une abstraction : **ajoute-la seulement si
elle absorbe une vraie variation.** Sinon, non.

---

## 2. Nommage

| Élément                | Convention                  | Exemple                           |
| ---------------------- | --------------------------- | --------------------------------- |
| Méthodes de lecture    | `getX`                      | `getPlayer`, `getPlayerStats`     |
| Méthodes streaming     | `streamX`                   | `streamPlayerGames`               |
| Prédicats              | `isX` / `hasX`              | `isPlayerOnline`                  |
| Ports (interfaces)     | `XxxTransport` / `XxxStore` | `HttpTransport`, `CacheStore`     |
| Adapters (impl. ports) | nom concret du détail       | `FetchTransport`, `EtagCache`     |
| Erreurs                | `XxxError`                  | `NotFoundError`, `RateLimitError` |
| Types/interfaces       | `PascalCase`                | `Player`, `GameArchive`           |
| Fichiers               | `kebab-case.ts`             | `fetch-transport.ts`              |
| Variables/fonctions    | `camelCase`                 | `playerName`, `buildUrl`          |

- Pas d'abréviations obscures. `username` pas `un`, `response` pas `res` (sauf idiomes
  ultra-établis).
- Le nom doit dire l'intention. Si tu as besoin d'un commentaire pour expliquer ce que
  fait une variable, renomme-la.

---

## 3. Fonctions & fichiers

- **Une responsabilité par fichier** : une raison de changer. Le rate-limiter ne sait
  rien du cache ; le cache ne sait rien des joueurs.
- Fonctions courtes et focalisées. Si une fonction fait trois choses, découpe-la.
- Pas de paramètres booléens positionnels qui changent le comportement — préfère un
  objet d'options nommées.
- Évite l'imbrication profonde : early-return plutôt que `if` imbriqués.

---

## 4. Types

- **`strict: true`** dans `tsconfig`. Pas de compromis.
- **Pas de `any`.** `unknown` + narrowing si le type est vraiment indéterminé (ex.
  body de cache). Lint : `no-explicit-any` activé.
- Les types publics sont dérivés des schémas zod (`z.infer`) puis ré-exportés depuis
  `index.ts` — une seule source de vérité.
- `PGN` est un `string` documenté en JSDoc, pas un branded type (friction inutile pour
  du PGN brut).
- Types de retour publics **explicites** (`explicit-module-boundary-types`).

---

## 5. Erreurs

- On `throw` des sous-types de `ChessComError` (pas de `Result`).
- Toute erreur porte `kind` (discriminant), `url`, et `status` quand pertinent.
- Ne jamais avaler une erreur en silence. Si on `ignore` (mode validation), c'est un
  choix explicite et documenté de l'utilisateur via `onValidationError`.
- Pas de `throw` de strings ni d'objets nus — toujours une instance d'`Error`.

---

## 6. Async

- `async/await` partout, jamais de `.then()` chaînés dans la logique métier.
- Lint : `no-floating-promises` activé — toute promesse est `await`ée ou
  explicitement gérée.
- Le streaming utilise des `async generator` (`async function*`).
- Respecter `AbortSignal` partout où une requête réseau est faite.

---

## 7. Tests

- **Un fichier de test miroir par module** : `foo.ts` → `foo.test.ts` (ou sous
  `test/` en miroir de `src/`).
- Tests déterministes : `fetch` injecté + fixtures, **aucun réseau en CI**.
- On teste le **comportement** (sérialisation, backoff, 304, erreurs typées), pas les
  détails d'implémentation privés.
- Fixtures réalistes capturées depuis la vraie API, rangées dans `test/fixtures/`.
- Nommer les tests par le comportement attendu :
  `it("serializes concurrent requests")`, pas `it("test rate limiter")`.

---

## 8. Documentation

- **TSDoc** sur tout élément public (classes, méthodes, types exportés) — utilisé par
  TypeDoc pour générer la doc API.
- Un exemple court dans le TSDoc des méthodes principales.
- Pas de commentaires qui répètent le code. Commenter le _pourquoi_, jamais le _quoi_.
- README : ouvre sur le disclaimer non-officiel, puis quickstart, puis surface d'API.

---

## 9. Lint & format (garde-fou automatique)

Le clean code non vérifié par la machine dérive toujours. Donc :

- `typescript-eslint` en config stricte : `no-explicit-any`, `no-floating-promises`,
  `explicit-module-boundary-types`, `no-unused-vars`, etc.
- Prettier pour le format (zéro débat de style).
- Les deux sont **bloquants en CI**. Un PR qui ne passe pas le lint ne merge pas.

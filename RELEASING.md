# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please)
and published to npm with GitHub Actions OIDC (trusted publishing — no tokens).

## How it works

1. Commits land on `main` following Conventional Commits.
2. The **release-please** workflow opens (and keeps updating) a "release PR" that
   bumps the version in `package.json` and updates `CHANGELOG.md`.
3. Merging that PR creates a Git tag and a GitHub Release.
4. The **publish** workflow runs on the published release and runs
   `npm publish --provenance` (which first runs `prepublishOnly`: check + build).

Version bumps follow the commit types:

| Commit                        | Bump  |
| ----------------------------- | ----- |
| `fix:`                        | patch |
| `feat:`                       | minor |
| `feat!:` / `BREAKING CHANGE:` | major |

(Pre-1.0, a `feat` bumps the minor and breaking changes bump the minor too.)

## One-time setup

These must be configured once by a maintainer:

1. **Allow Actions to open PRs** — repo Settings → Actions → General →
   "Allow GitHub Actions to create and approve pull requests". (release-please
   needs this to open its release PR.)
2. **npm trusted publishing (OIDC)** — on npmjs.com, open the package settings
   for `@dpianelli/chesscom` → Trusted Publisher → add a GitHub Actions publisher
   for repo `denispianelli/chesscom`, workflow `.github/workflows/publish.yml`.
   No `NPM_TOKEN` secret is then needed.

### First publish (bootstrap)

Trusted publishing is configured per existing package, so the very first publish
needs a bootstrap. Once, locally:

```bash
npm login
npm run build
npm publish --access public
```

After the package exists, configure the trusted publisher (step 2 above) and all
subsequent releases publish automatically via OIDC.

> Fallback (if you prefer tokens over OIDC): add an `NPM_TOKEN` repository secret
> and set `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` on the publish step.

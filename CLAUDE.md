# Jianghu: notes for Claude

AI interactive fiction for murim / regression / cultivation stories. pnpm monorepo, TypeScript, Node 22.

## Golden rule

The engine (`packages/engine`) is the source of truth. The narrator may only describe facts the engine produced. Never put game logic in prompts or in the web app.

## Engine rules

- `step()` must stay pure and deterministic: no `Math.random`, `Date.now`, or I/O. All randomness goes through `Rng` seeded from `GameState.rng`.
- `GameState` must stay JSON-serializable (saves, the stateless web API).
- Every new rule gets a test in `packages/engine/test/`. Every world must pass `validateWorld`.

## Conventions

- Workspace packages export TypeScript source directly (`"exports": "./src/index.ts"`); there is no build step for packages.
- Imports inside packages use `.js` extensions (`./step.js`).
- Must work on macOS (Apple Silicon) and Linux: no native deps, no shell-specific scripts.
- Premade worlds must be original settings.

## Commands

`pnpm test` · `pnpm typecheck` · `pnpm play` (CLI, `DEBUG_FACTS=1` to see engine facts) · `pnpm dev` (web)

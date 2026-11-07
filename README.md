# Jianghu

AI-native interactive fiction for murim, regression and cultivation stories. You die, you wake up on day 1 with your memories, and you use what you know to change fate.

The core idea: a **deterministic world engine** owns every fact (realms, qi, who is alive, what day it is, what you remember), and an **AI narrator** (Claude) only turns those facts into prose. That keeps the story consistent across hundreds of turns and many loops.

```
player text ──► intent parser ──► engine.step() ──► facts ──► narrator (Claude) ──► prose
                (rules, then LLM)  (pure, seeded)            (may only describe facts)
```

## Quick start (macOS)

Tested target: Apple Silicon (M-series) Macs. Nothing here needs native compilation.

```bash
# 1. Node 22 (pick one)
brew install node@22            # Homebrew
# or: brew install fnm && fnm install   (reads .nvmrc)

# 2. pnpm via Corepack (ships with Node; pins the version in package.json)
corepack enable

# 3. Clone and install
git clone https://github.com/jasonlu2006/jianghu.git
cd jianghu
pnpm install

# 4. (Optional) add your Claude API key. Without it, an offline mock narrator is used.
cp .env.example .env
open -e .env                    # paste ANTHROPIC_API_KEY=...

# 5. Play
pnpm play                       # terminal
pnpm dev                        # web app at http://localhost:3000 (open it on your phone via your Mac's LAN IP)
```

## Quick start (Linux)

Same steps; install Node 22 with your package manager, `fnm`, or `nvm`, then `corepack enable && pnpm install`. Use any editor instead of `open -e`.

## Working on two machines

- Commit and push from one, `git pull && pnpm install` on the other. The lockfile keeps both identical.
- `.env` and `saves/` are git-ignored: each machine has its own API key and saves.
- Line endings are normalized to LF (`.gitattributes`, `.editorconfig`).
- CI runs on **both macOS and Ubuntu** on every push, so a Mac-only or Linux-only break shows up immediately.

## Scripts

| Command          | What it does                                                                            |
| ---------------- | --------------------------------------------------------------------------------------- |
| `pnpm play`      | Play in the terminal. `DEBUG_FACTS=1 pnpm play` also prints the engine facts each turn. |
| `pnpm dev`       | Run the mobile-first web client.                                                        |
| `pnpm test`      | Engine + narrator tests (Vitest). No API key needed.                                    |
| `pnpm typecheck` | TypeScript across all packages.                                                         |
| `pnpm format`    | Prettier.                                                                               |

## Layout

```
packages/
  engine/     Deterministic rules: realms, qi, time, scheduled events, death, regression. No AI, no I/O.
  narrator/   Claude provider (plain fetch), offline mock, intent parser, prompts, GameSession glue.
  worlds/     Premade worlds. Starts with "The Fall of Azure Peak" (original setting).
apps/
  cli/        Terminal client, saves to ./saves/
  web/        Next.js chat client. Stateless API: the browser keeps the save in localStorage.
docs/         Architecture notes.
```

## How a turn works

1. `parseIntent` maps free text to an `Action` with keyword rules; if that fails and a real model is configured, a cheap model returns JSON; otherwise it becomes a `freeform` flavor action.
2. `step(world, state, action)` is pure and seeded: same inputs, same result. It returns the new state plus a list of **facts**.
3. Time advances in slots (morning, afternoon, night). Scheduled events fire on their day. Lethal events kill players below a realm threshold.
4. On death, `regress()` resets the world to day 1. The player keeps **knowledge** (memories) and gains **insight** (faster training, safer breakthroughs).
5. Events can declare `preventedIfDead`: kill the right person in time and fate changes.
6. `narrate` sends the scene + facts to Claude with hard rules: describe only what the facts say.

## Adding a world

Copy `packages/worlds/src/azure-peak.ts`, register it in `packages/worlds/src/index.ts`, and add it to the `validateWorld` test. Keep worlds original: no characters or places lifted from existing novels.

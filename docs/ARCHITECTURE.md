# Architecture

## Split of responsibilities

| Layer              | Owns                                                                                         | Never does                          |
| ------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------- |
| Engine             | Facts: time, realms, qi, HP, NPC life/location/affinity, events, death, regression, memories | Write prose, call an LLM, touch I/O |
| Narrator           | Prose, NPC voice, turning free text into actions                                             | Change state directly               |
| Clients (CLI, web) | Input, display, storing saves                                                                | Game rules                          |

## Data flow per turn

1. Client sends `{ snapshot, input }` (web) or calls `GameSession.takeTurn` (CLI).
2. `parseIntent`: keyword rules, then the intent model, then `freeform`.
3. `step()` returns `{ state, result }`. `result.facts` is the only thing the narrator may describe.
4. `narrate()` builds: system prompt (tone + hard rules), last 6 exchanges, current scene JSON, the turn's facts.
5. Client stores the new snapshot.

## Regression model

- Persists across loops: `knowledge[]`, `insight`, `history[]`, RNG position.
- Resets: day, location, realm, qi, HP, techniques, NPC state, fired events.
- `ScheduledEvent.preventedIfDead`: the hook for "change fate" plots.

## Next steps (engine)

- Conditions beyond "NPC dead" (an item held, an NPC warned, affinity reached).
- Per-world regression settings (what carries over).
- Loop summaries for the narrator so long runs stay cheap.
- A world builder: LLM drafts a `WorldDef`, `validateWorld` checks it, the player edits it.

import type { GameState, NpcState, WorldDef } from "./types.js";
import { TIME_SLOTS } from "./types.js";

export const BASE_HP = 100;
export const HP_PER_REALM = 40;

export function maxHpFor(realm: number): number {
  return BASE_HP + realm * HP_PER_REALM;
}

function freshNpcs(world: WorldDef): Record<string, NpcState> {
  const npcs: Record<string, NpcState> = {};
  for (const [id, def] of Object.entries(world.npcs)) {
    npcs[id] = {
      alive: true,
      location: def.location,
      affinity: def.affinity,
      met: false,
      suspicious: false,
    };
  }
  return npcs;
}

/** Start a brand-new game (first life). */
export function newGame(world: WorldDef, seed: number): GameState {
  const p = world.player;
  return {
    version: 1,
    worldId: world.id,
    seed,
    rng: seed >>> 0,
    loop: 0,
    day: 1,
    slot: 0,
    turn: 0,
    player: {
      name: p.name,
      location: p.startLocation,
      realm: p.startRealm,
      qi: p.startQi,
      hp: maxHpFor(p.startRealm),
      maxHp: maxHpFor(p.startRealm),
      techniques: [...p.startTechniques],
      alive: true,
    },
    npcs: freshNpcs(world),
    firedEvents: [],
    knowledge: [],
    insight: 0,
    history: [],
  };
}

/**
 * Regression: the world resets to day 1, the player keeps their memories
 * (knowledge) and gains insight. Body, realm, qi, items and relationships reset.
 */
export function regress(world: WorldDef, state: GameState, cause: string): GameState {
  const fresh = newGame(world, state.seed);
  return {
    ...fresh,
    rng: state.rng,
    turn: state.turn,
    loop: state.loop + 1,
    knowledge: [...state.knowledge],
    insight: state.insight + 1,
    history: [
      ...state.history,
      { loop: state.loop, diedOnDay: state.day, cause, realmReached: state.player.realm },
    ],
  };
}

export function timeLabel(state: GameState): string {
  return `Day ${state.day}, ${TIME_SLOTS[state.slot] ?? "morning"}`;
}

export function realmName(world: WorldDef, realm: number): string {
  return world.realms[realm]?.name ?? `Realm ${realm}`;
}

/** Deep copy so step() never mutates its input. */
export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

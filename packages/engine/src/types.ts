/**
 * Core types. The engine owns every fact about the world; the narrator only
 * turns engine results into prose. Keep everything here JSON-serializable so a
 * whole game can be saved, sent to a server, or replayed from a seed.
 */

// ---------- World definition (static, authored or user-generated) ----------

export interface RealmDef {
  id: string;
  name: string;
  /** Qi needed to break through INTO this realm. */
  qiRequired: number;
}

export interface LocationDef {
  id: string;
  name: string;
  description: string;
  exits: string[];
  tags?: string[];
}

export interface NpcSecret {
  /** Knowledge id the player gains when the secret is revealed. */
  knowledge: string;
  /** Affinity needed before the NPC shares it. */
  requiresAffinity: number;
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  faction: string;
  /** Index into WorldDef.realms. */
  realm: number;
  location: string;
  personality: string;
  /** Starting affinity toward the player, -100..100. */
  affinity: number;
  secrets?: NpcSecret[];
  /** Technique this NPC can teach once affinity is high enough. */
  teaches?: { technique: string; requiresAffinity: number };
}

export interface TechniqueDef {
  id: string;
  name: string;
  description: string;
  /** Minimum realm index to learn. */
  realmRequired: number;
  /** Added to combat power. */
  power: number;
  /** Multiplier on qi gained from training (1 = none). */
  trainingBonus?: number;
}

export interface KnowledgeDef {
  id: string;
  text: string;
  /** Knowledge the regressor carries from the future. NPCs find it suspicious. */
  future?: boolean;
}

export type EventEffect =
  | { type: "killNpc"; npc: string }
  | { type: "moveNpc"; npc: string; to: string }
  | { type: "changeAffinity"; npc: string; delta: number }
  | { type: "grantKnowledge"; knowledge: string }
  | {
      type: "lethal";
      /** Locations where it is deadly; omit for world-wide. */
      locations?: string[];
      /** Player survives if at or above this realm index. */
      surviveRealm: number;
    };

export interface ScheduledEvent {
  id: string;
  day: number;
  title: string;
  description: string;
  effects: EventEffect[];
  /** The event never happens if this NPC is dead by then: how a regressor changes fate. */
  preventedIfDead?: string;
  /** Knowledge granted to the player if they witness or survive it. Carries across loops. */
  revealsKnowledge?: string;
}

export interface WorldDef {
  id: string;
  name: string;
  genre: string;
  /** Premise shown at the start of every loop. */
  premise: string;
  /** Style notes for the narrator. */
  tone: string;
  realms: RealmDef[];
  locations: Record<string, LocationDef>;
  npcs: Record<string, NpcDef>;
  techniques: Record<string, TechniqueDef>;
  knowledge: Record<string, KnowledgeDef>;
  events: ScheduledEvent[];
  player: {
    name: string;
    background: string;
    startLocation: string;
    startRealm: number;
    startQi: number;
    startTechniques: string[];
  };
  /** Days in one loop before the "final calamity" forces regression anyway. */
  loopLength: number;
}

// ---------- Mutable game state ----------

export type TimeSlot = "morning" | "afternoon" | "night";
export const TIME_SLOTS: TimeSlot[] = ["morning", "afternoon", "night"];

export interface PlayerState {
  name: string;
  location: string;
  realm: number;
  qi: number;
  hp: number;
  maxHp: number;
  techniques: string[];
  alive: boolean;
}

export interface NpcState {
  alive: boolean;
  location: string;
  affinity: number;
  met: boolean;
  /** NPC noticed the player knows things they shouldn't. */
  suspicious: boolean;
}

export interface LoopSummary {
  loop: number;
  diedOnDay: number;
  cause: string;
  realmReached: number;
}

export interface GameState {
  version: 1;
  worldId: string;
  seed: number;
  rng: number;
  /** 0 = first life. Increments on every regression. */
  loop: number;
  day: number;
  slot: number;
  turn: number;
  player: PlayerState;
  npcs: Record<string, NpcState>;
  firedEvents: string[];
  /** Persists across regressions: the regressor's memory. */
  knowledge: string[];
  /** Persists across regressions: deaths sharpen comprehension. */
  insight: number;
  history: LoopSummary[];
}

// ---------- Actions and results ----------

export type Action =
  | { type: "move"; to: string }
  | { type: "train" }
  | { type: "rest" }
  | { type: "observe" }
  | { type: "talk"; npc: string; topic?: string }
  | { type: "learn"; npc: string }
  | { type: "fight"; npc: string }
  | { type: "wait"; days: number }
  | { type: "breakthrough" }
  /** Anything the engine has no rule for: narrated, costs a little time, changes nothing. */
  | { type: "freeform"; text: string };

export type Outcome = "success" | "partial" | "fail" | "invalid";

export interface TurnResult {
  action: Action;
  outcome: Outcome;
  /** Engine-true statements the narrator must stay within. */
  facts: string[];
  firedEvents: string[];
  knowledgeGained: string[];
  died: boolean;
  deathCause?: string;
  regressed: boolean;
}

export interface SuggestedAction {
  label: string;
  action: Action;
}

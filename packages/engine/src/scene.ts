import { realmName, timeLabel } from "./state.js";
import { affinityWord } from "./step.js";
import type { GameState, SuggestedAction, WorldDef } from "./types.js";

/**
 * A compact, narrator-facing snapshot of "what is true right now". Only facts
 * in here (plus the turn's facts) may appear in the prose.
 */
export interface Scene {
  time: string;
  loop: number;
  location: {
    id: string;
    name: string;
    description: string;
    exits: { id: string; name: string }[];
  };
  player: {
    name: string;
    realm: string;
    qi: number;
    hp: string;
    techniques: string[];
    insight: number;
  };
  npcsPresent: {
    id: string;
    name: string;
    title: string;
    faction: string;
    realm: string;
    personality: string;
    regard: string;
    met: boolean;
    suspicious: boolean;
  }[];
  memories: string[];
  pastDeaths: string[];
}

export function buildScene(world: WorldDef, s: GameState): Scene {
  const loc = world.locations[s.player.location]!;
  return {
    time: timeLabel(s),
    loop: s.loop + 1,
    location: {
      id: loc.id,
      name: loc.name,
      description: loc.description,
      exits: loc.exits.map((id) => ({ id, name: world.locations[id]?.name ?? id })),
    },
    player: {
      name: s.player.name,
      realm: realmName(world, s.player.realm),
      qi: s.player.qi,
      hp: `${s.player.hp}/${s.player.maxHp}`,
      techniques: s.player.techniques.map((t) => world.techniques[t]?.name ?? t),
      insight: s.insight,
    },
    npcsPresent: Object.entries(s.npcs)
      .filter(([, st]) => st.alive && st.location === s.player.location)
      .map(([id, st]) => {
        const d = world.npcs[id]!;
        return {
          id,
          name: d.name,
          title: d.title,
          faction: d.faction,
          realm: realmName(world, d.realm),
          personality: d.personality,
          regard: affinityWord(st.affinity),
          met: st.met,
          suspicious: st.suspicious,
        };
      }),
    memories: s.knowledge.map((k) => world.knowledge[k]?.text ?? k),
    pastDeaths: s.history.map((h) => `Loop ${h.loop + 1}: died on day ${h.diedOnDay}, ${h.cause}`),
  };
}

/** 3–4 sensible next actions for the suggestion chips under the chat. */
export function suggestActions(world: WorldDef, s: GameState): SuggestedAction[] {
  const out: SuggestedAction[] = [];
  const next = world.realms[s.player.realm + 1];

  if (s.player.hp < s.player.maxHp * 0.4)
    out.push({ label: "Rest and recover", action: { type: "rest" } });
  if (next && s.player.qi >= next.qiRequired) {
    out.push({ label: `Attempt breakthrough to ${next.name}`, action: { type: "breakthrough" } });
  }

  const npcHere = Object.entries(s.npcs).find(
    ([, st]) => st.alive && st.location === s.player.location,
  );
  if (npcHere) {
    const d = world.npcs[npcHere[0]]!;
    out.push({ label: `Talk to ${d.name}`, action: { type: "talk", npc: d.id } });
  }

  out.push({ label: "Cultivate", action: { type: "train" } });

  const loc = world.locations[s.player.location]!;
  const exit = loc.exits[s.turn % Math.max(1, loc.exits.length)];
  if (exit && out.length < 4) {
    out.push({
      label: `Go to ${world.locations[exit]?.name ?? exit}`,
      action: { type: "move", to: exit },
    });
  }
  if (out.length < 4) out.push({ label: "Look around", action: { type: "observe" } });

  return out.slice(0, 4);
}

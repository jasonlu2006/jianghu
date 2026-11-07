import type { Action, GameState, WorldDef } from "@murim/engine";
import type { LLMProvider } from "./provider.js";

/**
 * Free text -> engine Action. Fast keyword rules first (free, instant, works
 * offline); only if those fail do we ask the cheap "intent" model.
 */
export async function parseIntent(
  text: string,
  world: WorldDef,
  state: GameState,
  provider?: LLMProvider,
): Promise<Action> {
  const local = parseIntentLocal(text, world, state);
  if (local) return local;
  if (provider && provider.name !== "mock") {
    try {
      const llm = await parseIntentLLM(text, world, state, provider);
      if (llm) return llm;
    } catch {
      // fall through to freeform; never block a turn on the parser
    }
  }
  return { type: "freeform", text };
}

const has = (t: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}`, "i").test(t));

export function parseIntentLocal(text: string, world: WorldDef, state: GameState): Action | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;

  if (has(t, ["break ?through", "breakthrough", "advance my realm"]))
    return { type: "breakthrough" };

  const wait = t.match(/\bwait\b(?:\s+for)?\s+(\d+)\s+days?/);
  if (wait) return { type: "wait", days: Number(wait[1]) };

  const npc = findNpc(t, world, state);

  if (npc && has(t, ["learn", "teach", "instruct", "become .* disciple"]))
    return { type: "learn", npc };
  if (npc && has(t, ["attack", "fight", "kill", "strike", "duel", "assassinate", "challenge"])) {
    return { type: "fight", npc };
  }
  if (npc && has(t, ["talk", "ask", "speak", "tell", "greet", "bow", "warn", "chat", "say"])) {
    const topic = findTopic(t, world, state);
    return topic ? { type: "talk", npc, topic } : { type: "talk", npc };
  }

  const dest = findExit(t, world, state);
  if (
    dest &&
    (has(t, [
      "go",
      "walk",
      "head",
      "travel",
      "move",
      "enter",
      "return",
      "run",
      "climb",
      "descend",
      "visit",
      "to the",
    ]) ||
      t.length < 30)
  ) {
    return { type: "move", to: dest };
  }

  if (has(t, ["train", "cultivat", "meditat", "practi[cs]e", "circulate"]))
    return { type: "train" };
  if (has(t, ["rest", "sleep", "heal", "recover", "nap"])) return { type: "rest" };
  if (has(t, ["look", "observe", "examine", "survey", "where am i", "around"]))
    return { type: "observe" };

  // A bare NPC mention ("Lin Hao?") is most likely a greeting.
  if (npc) return { type: "talk", npc };
  return null;
}

function findNpc(t: string, world: WorldDef, state: GameState): string | undefined {
  const score = (id: string) => {
    const d = world.npcs[id]!;
    const names = [d.name, d.id.replace(/-/g, " "), d.title]
      .flatMap((n) => n.toLowerCase().split(/[\s,]+/))
      .filter(
        (w) => w.length >= 3 && !["the", "of", "elder", "disciple", "outer", "inner"].includes(w),
      );
    return names.some((w) => t.includes(w)) ? 1 : 0;
  };
  const present = Object.keys(state.npcs).filter(
    (id) => state.npcs[id]!.alive && state.npcs[id]!.location === state.player.location,
  );
  return present.find(score) ?? Object.keys(world.npcs).find(score);
}

function findExit(t: string, world: WorldDef, state: GameState): string | undefined {
  const here = world.locations[state.player.location];
  return here?.exits.find((id) => {
    const loc = world.locations[id]!;
    const words = [loc.name, id.replace(/-/g, " ")]
      .flatMap((n) => n.toLowerCase().split(/\s+/))
      .filter((w) => w.length >= 4 && !["the", "hall", "outer"].includes(w));
    return words.some((w) => t.includes(w));
  });
}

function findTopic(t: string, world: WorldDef, state: GameState): string | undefined {
  return state.knowledge.find((id) => {
    const k = world.knowledge[id];
    if (!k) return false;
    const keywords = k.text
      .toLowerCase()
      .replace(/[^a-z\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 6);
    return keywords.some((w) => t.includes(w));
  });
}

async function parseIntentLLM(
  text: string,
  world: WorldDef,
  state: GameState,
  provider: LLMProvider,
): Promise<Action | null> {
  const here = world.locations[state.player.location]!;
  const npcs = Object.keys(state.npcs).filter(
    (id) => state.npcs[id]!.alive && state.npcs[id]!.location === state.player.location,
  );
  const system = `You convert a player's message in a text RPG into ONE JSON action. Reply with JSON only, or null if nothing fits.
Schemas:
{"type":"move","to":<exit id>} | {"type":"train"} | {"type":"rest"} | {"type":"observe"} | {"type":"breakthrough"}
{"type":"talk","npc":<npc id>,"topic"?:<knowledge id>} | {"type":"learn","npc":<npc id>} | {"type":"fight","npc":<npc id>} | {"type":"wait","days":<1-30>}
Exit ids: ${here.exits.join(", ") || "none"}
NPC ids here: ${npcs.join(", ") || "none"}
Knowledge ids the player has: ${state.knowledge.join(", ") || "none"}`;
  const out = await provider.complete({
    system,
    messages: [{ role: "user", content: text }],
    maxTokens: 80,
    temperature: 0,
    purpose: "intent",
  });
  const json = out.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  const a = JSON.parse(json) as Action;
  const valid: Action["type"][] = [
    "move",
    "train",
    "rest",
    "observe",
    "breakthrough",
    "talk",
    "learn",
    "fight",
    "wait",
  ];
  return valid.includes(a.type) ? a : null;
}

import type { GameState, Scene, TurnResult, WorldDef } from "@murim/engine";
import { buildScene } from "@murim/engine";
import type { LLMMessage, LLMProvider } from "./provider.js";

export interface TranscriptEntry {
  player: string;
  narration: string;
}

/** How many past exchanges to send for continuity. Older turns live in engine state. */
const HISTORY_TURNS = 6;

export function narratorSystemPrompt(world: WorldDef): string {
  return `You are the narrator of an interactive ${world.genre} story set in "${world.name}".

STYLE: ${world.tone}

HARD RULES (the game engine is the source of truth):
1. Describe ONLY what the TURN FACTS and SCENE state. Never invent deaths, injuries, realm changes, new techniques, items, or events.
2. If a fact says an action was invalid or failed, show that in the story; do not let it succeed.
3. NPCs speak in character (see their personality and regard for the player). Suspicious NPCs act guarded.
4. The protagonist is a regressor: they remember previous loops ("memories"). Other characters do not.
5. When an EVENT fact appears, make it a dramatic beat. When the player dies and regresses, end on waking up on Day 1.
6. 80–180 words. No headings, no lists, no stat blocks. End at a moment that invites the player's next move.`;
}

export function turnPrompt(scene: Scene, playerInput: string, result: TurnResult): string {
  return `SCENE (before narration):
${JSON.stringify(scene, null, 1)}

PLAYER SAID: ${playerInput}

TURN FACTS (outcome: ${result.outcome}):
${result.facts.map((f) => `- ${f}`).join("\n")}`;
}

export async function narrate(
  provider: LLMProvider,
  world: WorldDef,
  state: GameState,
  playerInput: string,
  result: TurnResult,
  transcript: TranscriptEntry[],
): Promise<string> {
  const history: LLMMessage[] = transcript.slice(-HISTORY_TURNS).flatMap((t) => [
    { role: "user" as const, content: t.player },
    { role: "assistant" as const, content: t.narration },
  ]);
  return provider.complete({
    system: narratorSystemPrompt(world),
    messages: [
      ...history,
      { role: "user", content: turnPrompt(buildScene(world, state), playerInput, result) },
    ],
    purpose: "narrator",
  });
}

export async function narrateOpening(
  provider: LLMProvider,
  world: WorldDef,
  state: GameState,
): Promise<string> {
  const scene = buildScene(world, state);
  const facts = [
    world.premise,
    `It is ${scene.time}.`,
    `${scene.location.name}: ${scene.location.description}`,
  ];
  if (state.loop > 0)
    facts.push(
      `This is loop ${scene.loop}. The protagonist remembers: ${scene.memories.join(" ") || "only pain"}`,
    );
  return provider.complete({
    system: narratorSystemPrompt(world),
    messages: [
      {
        role: "user",
        content: `Write the opening scene.\nSCENE:\n${JSON.stringify(scene, null, 1)}\n\nFACTS:\n${facts.map((f) => `- ${f}`).join("\n")}`,
      },
    ],
    purpose: "narrator",
  });
}

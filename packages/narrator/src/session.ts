import type { Action, GameState, SuggestedAction, TurnResult, WorldDef } from "@murim/engine";
import { newGame, seedFromString, step, suggestActions } from "@murim/engine";
import { parseIntent } from "./intent.js";
import { narrate, narrateOpening, type TranscriptEntry } from "./narrate.js";
import type { LLMProvider } from "./provider.js";

export interface SessionSnapshot {
  state: GameState;
  transcript: TranscriptEntry[];
}

export interface TurnOutput {
  narration: string;
  result: TurnResult;
  suggestions: SuggestedAction[];
  state: GameState;
}

/**
 * Glue between engine and narrator: text in, prose + new state out.
 * Stateless-friendly: snapshot() / restore() let a server keep no memory
 * between requests (the client sends the snapshot back each turn).
 */
export class GameSession {
  private transcript: TranscriptEntry[];

  constructor(
    readonly world: WorldDef,
    public state: GameState,
    private readonly provider: LLMProvider,
    transcript: TranscriptEntry[] = [],
  ) {
    this.transcript = transcript;
  }

  static start(world: WorldDef, provider: LLMProvider, seed?: string | number): GameSession {
    const n = typeof seed === "number" ? seed : seedFromString(seed ?? `${Date.now()}`);
    return new GameSession(world, newGame(world, n), provider);
  }

  static restore(world: WorldDef, provider: LLMProvider, snap: SessionSnapshot): GameSession {
    return new GameSession(world, snap.state, provider, snap.transcript);
  }

  snapshot(): SessionSnapshot {
    return { state: this.state, transcript: this.transcript.slice(-20) };
  }

  suggestions(): SuggestedAction[] {
    return suggestActions(this.world, this.state);
  }

  async opening(): Promise<string> {
    const text = await narrateOpening(this.provider, this.world, this.state);
    this.transcript.push({ player: "(begin)", narration: text });
    return text;
  }

  async takeTurn(input: string | Action): Promise<TurnOutput> {
    const playerText = typeof input === "string" ? input : describeAction(input);
    const action =
      typeof input === "string"
        ? await parseIntent(input, this.world, this.state, this.provider)
        : input;

    const before = this.state;
    const { state, result } = step(this.world, before, action);
    // Narrate against the pre-regression state when the player died, so the scene matches the death.
    const narration = await narrate(
      this.provider,
      this.world,
      result.regressed ? before : state,
      playerText,
      result,
      this.transcript,
    );

    this.state = state;
    this.transcript.push({ player: playerText, narration });
    return { narration, result, suggestions: this.suggestions(), state };
  }
}

function describeAction(a: Action): string {
  switch (a.type) {
    case "move":
      return `I go to ${a.to}.`;
    case "talk":
      return a.topic ? `I talk to ${a.npc} about ${a.topic}.` : `I talk to ${a.npc}.`;
    case "learn":
      return `I ask ${a.npc} to teach me.`;
    case "fight":
      return `I attack ${a.npc}.`;
    case "wait":
      return `I wait ${a.days} days.`;
    case "freeform":
      return a.text;
    default:
      return `I ${a.type}.`;
  }
}

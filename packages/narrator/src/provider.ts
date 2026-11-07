/**
 * Minimal LLM interface so the narrator is not tied to one vendor or SDK.
 * Uses plain fetch, so it runs in Node, Next.js route handlers and edge runtimes.
 */
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Which tier to use: "narrator" for prose, "intent" for cheap parsing. */
  purpose?: "narrator" | "intent";
}

export interface LLMProvider {
  readonly name: string;
  complete(req: LLMRequest): Promise<string>;
}

export interface AnthropicOptions {
  apiKey: string;
  narratorModel?: string;
  intentModel?: string;
  baseUrl?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly narratorModel: string;
  private readonly intentModel: string;
  private readonly baseUrl: string;

  constructor(private readonly opts: AnthropicOptions) {
    this.narratorModel = opts.narratorModel ?? "claude-sonnet-5-5";
    this.intentModel = opts.intentModel ?? "claude-haiku-5-5";
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
  }

  async complete(req: LLMRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.purpose === "intent" ? this.intentModel : this.narratorModel,
        max_tokens: req.maxTokens ?? 700,
        temperature: req.temperature ?? 0.8,
        system: req.system,
        messages: req.messages,
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
  }
}

/**
 * Offline provider: no network, deterministic. Lets you build the UI, run
 * tests and play-test the engine without an API key or spending money.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async complete(req: LLMRequest): Promise<string> {
    if (req.purpose === "intent") return "null";
    const last = req.messages.at(-1)?.content ?? "";
    const facts = last
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2));
    return facts.length ? facts.join(" ") : "The wind moves across the mountain. Nothing happens.";
  }
}

/** Picks Anthropic when a key is set, otherwise the mock. */
export function providerFromEnv(
  env: Record<string, string | undefined> = process.env,
): LLMProvider {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return new MockProvider();
  return new AnthropicProvider({
    apiKey,
    narratorModel: env.NARRATOR_MODEL || undefined,
    intentModel: env.INTENT_MODEL || undefined,
  });
}

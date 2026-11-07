import { describe, expect, it } from "vitest";
import { newGame } from "@murim/engine";
import { azurePeak as world } from "../../worlds/src/azure-peak.js";
import { GameSession, MockProvider, parseIntentLocal } from "../src/index.js";

describe("intent parsing (offline rules)", () => {
  const s = newGame(world, 1);
  const yard = { ...s, player: { ...s.player, location: "training-yard" } };

  it.each([
    ["I sit down and cultivate", { type: "train" }],
    ["go to the training yard", { type: "move", to: "training-yard" }],
    ["head down to the mountain gate", { type: "move", to: "mountain-gate" }],
    ["wait 5 days", { type: "wait", days: 5 }],
    ["attempt a breakthrough", { type: "breakthrough" }],
  ])("%s", (text, expected) => {
    expect(parseIntentLocal(text, world, s)).toEqual(expected);
  });

  it("finds present NPCs by name", () => {
    expect(parseIntentLocal("ask Lin Hao about the sect", world, yard)).toEqual({
      type: "talk",
      npc: "lin-hao",
    });
    expect(parseIntentLocal("challenge senior sister Shen to a duel", world, yard)).toEqual({
      type: "fight",
      npc: "shen-yue",
    });
  });

  it("returns null for things it cannot parse", () => {
    expect(parseIntentLocal("I compose a poem about clouds", world, s)).toBeNull();
  });
});

describe("GameSession with the mock provider", () => {
  it("plays turns end to end and round-trips a snapshot", async () => {
    const session = GameSession.start(world, new MockProvider(), "test-seed");
    expect(await session.opening()).toBeTruthy();
    const out = await session.takeTurn("go to the training yard");
    expect(out.state.player.location).toBe("training-yard");
    expect(out.narration).toContain("Training Yard");
    expect(out.suggestions.length).toBeGreaterThan(0);

    const restored = GameSession.restore(
      world,
      new MockProvider(),
      JSON.parse(JSON.stringify(session.snapshot())),
    );
    expect(restored.state).toEqual(session.state);
  });
});

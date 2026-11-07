import { describe, expect, it } from "vitest";
import { newGame, step, suggestActions, validateWorld, type GameState } from "../src/index.js";
import { azurePeak as world } from "../../worlds/src/azure-peak.js";

const run = (s: GameState, ...actions: Parameters<typeof step>[2][]) => {
  let state = s;
  const results = [];
  for (const a of actions) {
    const r = step(world, state, a);
    state = r.state;
    results.push(r.result);
  }
  return { state, results };
};

describe("world definition", () => {
  it("azure-peak has no broken references", () => {
    expect(validateWorld(world)).toEqual([]);
  });
});

describe("determinism", () => {
  it("same seed + same actions = identical state", () => {
    const actions = [
      { type: "train" },
      { type: "train" },
      { type: "move", to: "training-yard" },
      { type: "train" },
    ] as const;
    const a = run(newGame(world, 42), ...actions);
    const b = run(newGame(world, 42), ...actions);
    expect(a.state).toEqual(b.state);
  });

  it("does not mutate the input state", () => {
    const s = newGame(world, 1);
    const copy = structuredClone(s);
    step(world, s, { type: "train" });
    expect(s).toEqual(copy);
  });
});

describe("rules", () => {
  it("rejects moves with no path", () => {
    const { results, state } = run(newGame(world, 1), { type: "move", to: "back-mountain" });
    expect(results[0]!.outcome).toBe("invalid");
    expect(state.player.location).toBe("outer-courtyard");
    expect(state.slot).toBe(0); // invalid actions cost no time
  });

  it("training gains qi and advances time", () => {
    const { state } = run(newGame(world, 1), { type: "train" });
    expect(state.player.qi).toBeGreaterThan(20);
    expect(state.slot).toBe(1);
  });

  it("offers 1-4 suggestions", () => {
    const s = suggestActions(world, newGame(world, 1));
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(4);
  });
});

describe("regression", () => {
  it("the massacre kills a weak disciple, who regresses with memories", () => {
    const { state, results } = run(
      newGame(world, 7),
      { type: "wait", days: 30 },
      { type: "wait", days: 15 },
    );
    const death = results.find((r) => r.died)!;
    expect(death.regressed).toBe(true);
    expect(death.deathCause).toBe("The Blood Lotus massacre");
    expect(state.loop).toBe(1);
    expect(state.day).toBe(1);
    expect(state.player.alive).toBe(true);
    expect(state.insight).toBe(1);
    expect(state.knowledge).toEqual(
      expect.arrayContaining(["cult-attack", "gu-wen-traitor", "bai-poisoned"]),
    );
    expect(state.npcs["bai-ruolan"]!.alive).toBe(true); // the world reset
  });

  it("killing the traitor before day 44 prevents the massacre", () => {
    const start = newGame(world, 7);
    start.npcs["gu-wen"]!.alive = false;
    const { state, results } = run(start, { type: "wait", days: 30 }, { type: "wait", days: 15 });
    expect(results.some((r) => r.died)).toBe(false);
    expect(state.loop).toBe(0);
    expect(state.npcs["bai-ruolan"]!.alive).toBe(true);
    expect(results.flatMap((r) => r.facts).some((f) => f.startsWith("FATE CHANGED"))).toBe(true);
  });
});

import { Rng } from "./rng.js";
import { cloneState, maxHpFor, realmName, regress, timeLabel } from "./state.js";
import type { Action, GameState, TurnResult, WorldDef } from "./types.js";
import { TIME_SLOTS } from "./types.js";

/**
 * The single entry point for changing the world. Pure: same world + state +
 * action always gives the same result, because all randomness comes from the
 * seeded RNG stored in the state.
 */
export function step(
  world: WorldDef,
  input: GameState,
  action: Action,
): { state: GameState; result: TurnResult } {
  const s = cloneState(input);
  const rng = new Rng(s.rng);
  const res: TurnResult = {
    action,
    outcome: "success",
    facts: [],
    firedEvents: [],
    knowledgeGained: [],
    died: false,
    regressed: false,
  };

  if (!s.player.alive) {
    res.outcome = "invalid";
    res.facts.push("The player is dead; the game must regress first.");
    return { state: s, result: res };
  }

  s.turn += 1;
  const slots = resolveAction(world, s, action, rng, res);
  if (!res.died && slots > 0) advanceTime(world, s, slots, rng, res);

  s.rng = rng.state;

  if (res.died) {
    const cause = res.deathCause ?? "unknown causes";
    res.facts.push(
      `${s.player.name} died on ${timeLabel(s)} (${cause}). Their eyes open again on Day 1 of loop ${s.loop + 2}, memories intact.`,
    );
    res.regressed = true;
    return { state: regress(world, s, cause), result: res };
  }

  return { state: s, result: res };
}

// ---------------------------------------------------------------------------

function resolveAction(
  world: WorldDef,
  s: GameState,
  action: Action,
  rng: Rng,
  res: TurnResult,
): number {
  const p = s.player;
  const here = world.locations[p.location];

  switch (action.type) {
    case "move": {
      const dest = world.locations[action.to];
      if (!dest || !here?.exits.includes(action.to)) {
        return invalid(res, `There is no path from ${here?.name ?? p.location} to "${action.to}".`);
      }
      p.location = dest.id;
      res.facts.push(`${p.name} travels to ${dest.name}. ${dest.description}`);
      describePresentNpcs(world, s, res);
      return 1;
    }

    case "train": {
      const bonus = Math.max(
        1,
        ...p.techniques.map((t) => world.techniques[t]?.trainingBonus ?? 1),
      );
      const placeBonus = here?.tags?.includes("training") ? 1.5 : 1;
      const insightBonus = 1 + 0.15 * s.insight;
      const gain = Math.round(rng.int(8, 14) * bonus * placeBonus * insightBonus);
      p.qi += gain;
      res.facts.push(`${p.name} cultivates and gains ${gain} qi (now ${p.qi}).`);
      const next = world.realms[p.realm + 1];
      if (next && p.qi >= next.qiRequired) {
        res.facts.push(`Their qi is full enough to attempt a breakthrough to ${next.name}.`);
      }
      return 1;
    }

    case "breakthrough": {
      const next = world.realms[p.realm + 1];
      if (!next) return invalid(res, `${p.name} is already at the peak realm of this world.`);
      if (p.qi < next.qiRequired) {
        return invalid(res, `Not enough qi for ${next.name} (${p.qi}/${next.qiRequired}).`);
      }
      const secluded = here?.tags?.includes("secluded") ? 0.15 : 0;
      const chance = Math.min(0.95, 0.6 + 0.1 * s.insight + secluded);
      if (rng.chance(chance)) {
        p.realm += 1;
        p.maxHp = maxHpFor(p.realm);
        p.hp = p.maxHp;
        res.facts.push(`Breakthrough succeeds: ${p.name} reaches ${next.name}.`);
      } else {
        res.outcome = "fail";
        p.qi = Math.floor(p.qi * 0.8);
        p.hp -= Math.ceil(p.maxHp * 0.35);
        res.facts.push(`Breakthrough fails: qi deviation tears through the meridians.`);
        if (p.hp <= 0) die(s, res, "qi deviation during a breakthrough");
      }
      return 2;
    }

    case "rest": {
      const healed = Math.min(p.maxHp - p.hp, Math.ceil(p.maxHp * 0.4));
      p.hp += healed;
      res.facts.push(`${p.name} rests and recovers ${healed} HP (${p.hp}/${p.maxHp}).`);
      return 1;
    }

    case "wait": {
      const days = Math.max(1, Math.min(30, Math.floor(action.days)));
      p.hp = p.maxHp;
      res.facts.push(`${p.name} lets ${days} day(s) pass.`);
      return days * TIME_SLOTS.length;
    }

    case "observe": {
      res.facts.push(`${here?.name}: ${here?.description}`);
      const exits = (here?.exits ?? []).map((e) => world.locations[e]?.name ?? e);
      res.facts.push(`Paths lead to: ${exits.join(", ") || "nowhere"}.`);
      describePresentNpcs(world, s, res, true);
      return 1;
    }

    case "talk": {
      const npc = presentNpc(world, s, action.npc, res);
      if (!npc) return 0;
      const st = s.npcs[npc.id]!;
      st.met = true;
      st.affinity = clamp(st.affinity + rng.int(1, 6));
      res.facts.push(`${p.name} speaks with ${npc.name}, ${npc.title}.`);

      if (action.topic) {
        const k = world.knowledge[action.topic];
        if (k && s.knowledge.includes(k.id) && k.future) {
          if (st.affinity >= 40) {
            st.affinity = clamp(st.affinity + 10);
            res.facts.push(
              `${npc.name} is shaken by what ${p.name} knows but chooses to believe them.`,
            );
          } else {
            st.affinity = clamp(st.affinity - 10);
            st.suspicious = true;
            res.outcome = "partial";
            res.facts.push(`${npc.name} grows suspicious: how could ${p.name} know "${k.text}"?`);
          }
        } else if (k) {
          res.facts.push(`They discuss: ${k.text}`);
        }
      }

      for (const secret of npc.secrets ?? []) {
        if (st.affinity >= secret.requiresAffinity)
          gainKnowledge(world, s, res, secret.knowledge, npc.name);
      }
      res.facts.push(`${npc.name}'s regard for ${p.name}: ${affinityWord(st.affinity)}.`);
      return 1;
    }

    case "learn": {
      const npc = presentNpc(world, s, action.npc, res);
      if (!npc) return 0;
      const teach = npc.teaches;
      const tech = teach ? world.techniques[teach.technique] : undefined;
      if (!teach || !tech) return invalid(res, `${npc.name} has nothing to teach.`);
      if (p.techniques.includes(tech.id))
        return invalid(res, `${p.name} already knows ${tech.name}.`);
      if (s.npcs[npc.id]!.affinity < teach.requiresAffinity) {
        res.outcome = "fail";
        res.facts.push(`${npc.name} refuses to teach ${tech.name} to someone they barely trust.`);
        return 1;
      }
      if (p.realm < tech.realmRequired) {
        res.outcome = "fail";
        res.facts.push(
          `${tech.name} needs at least ${realmName(world, tech.realmRequired)}; ${p.name}'s body cannot hold it yet.`,
        );
        return 1;
      }
      p.techniques.push(tech.id);
      res.facts.push(`${npc.name} teaches ${p.name} the ${tech.name}. ${tech.description}`);
      return 2;
    }

    case "fight": {
      const npc = presentNpc(world, s, action.npc, res);
      if (!npc) return 0;
      const st = s.npcs[npc.id]!;
      const techPower = p.techniques.reduce((sum, t) => sum + (world.techniques[t]?.power ?? 0), 0);
      const mine = p.realm * 25 + p.qi * 0.1 + techPower + rng.int(0, 20);
      const theirs = npc.realm * 25 + 15 + rng.int(0, 20);
      st.met = true;
      st.affinity = clamp(st.affinity - 30);
      if (mine >= theirs) {
        if (mine - theirs > 25) {
          st.alive = false;
          res.facts.push(`${p.name} overwhelms and kills ${npc.name}.`);
        } else {
          res.facts.push(`${p.name} defeats ${npc.name}, who retreats wounded.`);
        }
      } else {
        res.outcome = "fail";
        const dmg = Math.round((theirs - mine) * 2 + 10);
        p.hp -= dmg;
        res.facts.push(
          `${npc.name} (${realmName(world, npc.realm)}) outclasses ${p.name}, dealing ${dmg} damage.`,
        );
        if (p.hp <= 0) die(s, res, `slain by ${npc.name}`);
      }
      return 1;
    }

    case "freeform": {
      res.outcome = "partial";
      res.facts.push(
        `No game rule covers "${action.text}". Narrate it briefly as flavor; it changes no stats, NPCs or events.`,
      );
      return 1;
    }
  }
}

function advanceTime(world: WorldDef, s: GameState, slots: number, rng: Rng, res: TurnResult) {
  for (let i = 0; i < slots && !res.died; i++) {
    s.slot += 1;
    if (s.slot >= TIME_SLOTS.length) {
      s.slot = 0;
      s.day += 1;
      fireEvents(world, s, res);
    }
    if (!res.died && s.day > world.loopLength) {
      die(s, res, "the final calamity that ends this timeline");
    }
  }
  void rng;
}

function fireEvents(world: WorldDef, s: GameState, res: TurnResult) {
  for (const ev of world.events) {
    if (ev.day > s.day || s.firedEvents.includes(ev.id) || res.died) continue;
    s.firedEvents.push(ev.id);
    if (ev.preventedIfDead && s.npcs[ev.preventedIfDead]?.alive === false) {
      const who = world.npcs[ev.preventedIfDead]?.name ?? ev.preventedIfDead;
      res.facts.push(
        `FATE CHANGED (${timeLabel(s)}): ${ev.title} never happens, because ${who} is dead.`,
      );
      continue;
    }
    res.firedEvents.push(ev.id);
    res.facts.push(`EVENT (${timeLabel(s)}): ${ev.title}. ${ev.description}`);

    let present = true;
    for (const eff of ev.effects) {
      switch (eff.type) {
        case "killNpc":
          if (s.npcs[eff.npc]) s.npcs[eff.npc]!.alive = false;
          break;
        case "moveNpc":
          if (s.npcs[eff.npc]) s.npcs[eff.npc]!.location = eff.to;
          break;
        case "changeAffinity":
          if (s.npcs[eff.npc])
            s.npcs[eff.npc]!.affinity = clamp(s.npcs[eff.npc]!.affinity + eff.delta);
          break;
        case "grantKnowledge":
          gainKnowledge(world, s, res, eff.knowledge, ev.title);
          break;
        case "lethal": {
          present = !eff.locations || eff.locations.includes(s.player.location);
          if (present && s.player.realm < eff.surviveRealm) {
            if (ev.revealsKnowledge) gainKnowledge(world, s, res, ev.revealsKnowledge, ev.title);
            die(s, res, ev.title);
          } else if (present) {
            res.facts.push(`${s.player.name} survives ${ev.title}.`);
          }
          break;
        }
      }
    }
    if (!res.died && present && ev.revealsKnowledge) {
      gainKnowledge(world, s, res, ev.revealsKnowledge, ev.title);
    }
  }
}

// ---------------------------------------------------------------------------

function presentNpc(world: WorldDef, s: GameState, id: string, res: TurnResult) {
  const npc = world.npcs[id];
  const st = s.npcs[id];
  if (!npc || !st) {
    invalid(res, `No one called "${id}" exists here.`);
    return undefined;
  }
  if (!st.alive) {
    invalid(res, `${npc.name} is dead in this timeline.`);
    return undefined;
  }
  if (st.location !== s.player.location) {
    invalid(res, `${npc.name} is not here.`);
    return undefined;
  }
  return npc;
}

function describePresentNpcs(world: WorldDef, s: GameState, res: TurnResult, detailed = false) {
  const here = Object.entries(s.npcs).filter(
    ([, st]) => st.alive && st.location === s.player.location,
  );
  if (here.length === 0) {
    res.facts.push("No one of note is here.");
    return;
  }
  for (const [id] of here) {
    const def = world.npcs[id]!;
    res.facts.push(
      detailed
        ? `${def.name}, ${def.title} of ${def.faction}, is here (${realmName(world, def.realm)}; ${def.personality}).`
        : `${def.name}, ${def.title}, is here.`,
    );
  }
}

function gainKnowledge(world: WorldDef, s: GameState, res: TurnResult, id: string, source: string) {
  if (s.knowledge.includes(id) || !world.knowledge[id]) return;
  s.knowledge.push(id);
  res.knowledgeGained.push(id);
  res.facts.push(`${s.player.name} learns (from ${source}): ${world.knowledge[id]!.text}`);
}

function die(s: GameState, res: TurnResult, cause: string) {
  s.player.alive = false;
  s.player.hp = 0;
  res.died = true;
  res.deathCause = cause;
  res.outcome = "fail";
}

function invalid(res: TurnResult, why: string): number {
  res.outcome = "invalid";
  res.facts.push(why);
  return 0;
}

function clamp(n: number): number {
  return Math.max(-100, Math.min(100, n));
}

export function affinityWord(a: number): string {
  if (a >= 70) return "devoted";
  if (a >= 40) return "trusting";
  if (a >= 10) return "friendly";
  if (a > -10) return "neutral";
  if (a > -40) return "wary";
  return "hostile";
}

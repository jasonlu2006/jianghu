import type { WorldDef } from "./types.js";

/**
 * Catches broken references in a world definition. Run it on every premade
 * world in tests, and on user-made worlds before saving them.
 */
export function validateWorld(world: WorldDef): string[] {
  const errors: string[] = [];
  const loc = (id: string, where: string) => {
    if (!world.locations[id]) errors.push(`${where}: unknown location "${id}"`);
  };
  const npc = (id: string, where: string) => {
    if (!world.npcs[id]) errors.push(`${where}: unknown npc "${id}"`);
  };
  const know = (id: string, where: string) => {
    if (!world.knowledge[id]) errors.push(`${where}: unknown knowledge "${id}"`);
  };
  const tech = (id: string, where: string) => {
    if (!world.techniques[id]) errors.push(`${where}: unknown technique "${id}"`);
  };
  const realm = (i: number, where: string) => {
    if (i < 0 || i >= world.realms.length) errors.push(`${where}: realm index ${i} out of range`);
  };

  for (const [id, l] of Object.entries(world.locations)) {
    if (l.id !== id) errors.push(`location key "${id}" != id "${l.id}"`);
    for (const e of l.exits) {
      loc(e, `location ${id} exit`);
      if (world.locations[e] && !world.locations[e]!.exits.includes(id)) {
        errors.push(`location ${id} -> ${e} has no path back`);
      }
    }
  }
  for (const [id, n] of Object.entries(world.npcs)) {
    if (n.id !== id) errors.push(`npc key "${id}" != id "${n.id}"`);
    loc(n.location, `npc ${id}`);
    realm(n.realm, `npc ${id}`);
    for (const s of n.secrets ?? []) know(s.knowledge, `npc ${id} secret`);
    if (n.teaches) tech(n.teaches.technique, `npc ${id} teaches`);
  }
  for (const [id, t] of Object.entries(world.techniques)) {
    if (t.id !== id) errors.push(`technique key "${id}" != id "${t.id}"`);
    realm(t.realmRequired, `technique ${id}`);
  }
  for (const ev of world.events) {
    if (ev.revealsKnowledge) know(ev.revealsKnowledge, `event ${ev.id}`);
    if (ev.preventedIfDead) npc(ev.preventedIfDead, `event ${ev.id} preventedIfDead`);
    if (ev.day > world.loopLength) errors.push(`event ${ev.id} is after loopLength`);
    for (const eff of ev.effects) {
      if ("npc" in eff) npc(eff.npc, `event ${ev.id}`);
      if (eff.type === "moveNpc") loc(eff.to, `event ${ev.id}`);
      if (eff.type === "grantKnowledge") know(eff.knowledge, `event ${ev.id}`);
      if (eff.type === "lethal") {
        for (const l of eff.locations ?? []) loc(l, `event ${ev.id}`);
        realm(eff.surviveRealm, `event ${ev.id}`);
      }
    }
  }
  loc(world.player.startLocation, "player start");
  realm(world.player.startRealm, "player start");
  for (const t of world.player.startTechniques) tech(t, "player start");
  return errors;
}

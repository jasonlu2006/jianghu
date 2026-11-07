import type { WorldDef } from "@murim/engine";
import { azurePeak } from "./azure-peak.js";

export { azurePeak };

export const worlds: Record<string, WorldDef> = {
  [azurePeak.id]: azurePeak,
};

export function getWorld(id: string): WorldDef {
  const w = worlds[id];
  if (!w) throw new Error(`Unknown world "${id}". Known: ${Object.keys(worlds).join(", ")}`);
  return w;
}

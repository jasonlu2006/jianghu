import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { realmName, timeLabel } from "@murim/engine";
import { GameSession, providerFromEnv, type SessionSnapshot } from "@murim/narrator";
import { getWorld } from "@murim/worlds";

const here = dirname(fileURLToPath(import.meta.url));
const SAVE_DIR = join(here, "..", "..", "..", "saves");
const worldId = process.argv[2] ?? "azure-peak";
const savePath = join(SAVE_DIR, `${worldId}.json`);

const world = getWorld(worldId);
const provider = providerFromEnv();
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const rl = createInterface({ input, output, terminal: input.isTTY });
  const lines: string[] = [];
  const waiters: ((l: string | null) => void)[] = [];
  let closed = false;
  rl.on("line", (l) => (waiters.length ? waiters.shift()!(l) : lines.push(l)));
  rl.on("close", () => {
    closed = true;
    waiters.splice(0).forEach((w) => w(null));
  });
  const ask = (prompt: string): Promise<string | null> => {
    output.write(prompt);
    if (lines.length) return Promise.resolve(lines.shift()!);
    if (closed) return Promise.resolve(null);
    return new Promise((r) => waiters.push(r));
  };
  console.log(bold(`\n${world.name}`) + dim(`  [narrator: ${provider.name}]`));
  if (provider.name === "mock")
    console.log(dim("No ANTHROPIC_API_KEY set: using offline mock narrator."));
  console.log(
    dim("Type what you do. Commands: /status /save /load /new /quit, or 1-4 for a suggestion.\n"),
  );

  let session = GameSession.start(world, provider);
  if (existsSync(savePath)) {
    const ans = (await ask("Found a save. Load it? (Y/n) ")) ?? "";
    if (!/^n/i.test(ans)) session = loadSave() ?? session;
  }
  console.log("\n" + (await session.opening()) + "\n");

  let suggestions = session.suggestions();
  for (;;) {
    printStatus(session, false);
    suggestions.forEach((s, i) => console.log(dim(`  ${i + 1}. ${s.label}`)));
    const raw = await ask("\n> ");
    if (raw === null) break;
    const line = raw.trim();
    if (!line) continue;

    if (line === "/quit") break;
    if (line === "/status") {
      printStatus(session, true);
      continue;
    }
    if (line === "/save") {
      save(session.snapshot());
      continue;
    }
    if (line === "/load") {
      session = loadSave() ?? session;
      suggestions = session.suggestions();
      continue;
    }
    if (line === "/new") {
      session = GameSession.start(world, provider);
      console.log("\n" + (await session.opening()) + "\n");
      suggestions = session.suggestions();
      continue;
    }

    const pick = /^[1-4]$/.test(line) ? suggestions[Number(line) - 1] : undefined;
    try {
      const out = await session.takeTurn(pick ? pick.action : line);
      console.log("\n" + out.narration + "\n");
      if (process.env.DEBUG_FACTS)
        console.log(dim(out.result.facts.map((f) => `  · ${f}`).join("\n")) + "\n");
      if (out.result.regressed)
        console.log(bold(`— Regression. Loop ${out.state.loop + 1} begins. —\n`));
      suggestions = out.suggestions;
      save(session.snapshot(), true);
    } catch (err) {
      console.error("Turn failed:", (err as Error).message);
    }
  }
  rl.close();
}

function printStatus(session: GameSession, full: boolean) {
  const s = session.state;
  const p = s.player;
  console.log(
    dim(
      `[${timeLabel(s)} · loop ${s.loop + 1} · ${world.locations[p.location]?.name} · ${realmName(world, p.realm)} · qi ${p.qi} · hp ${p.hp}/${p.maxHp}]`,
    ),
  );
  if (full) {
    console.log("Techniques: " + p.techniques.map((t) => world.techniques[t]?.name).join(", "));
    console.log(
      "Memories:\n" +
        (s.knowledge.map((k) => "  - " + world.knowledge[k]?.text).join("\n") || "  (none)"),
    );
    console.log(
      "Past deaths:\n" +
        (s.history
          .map((h) => `  - loop ${h.loop + 1}: day ${h.diedOnDay}, ${h.cause}`)
          .join("\n") || "  (none)"),
    );
  }
}

function save(snap: SessionSnapshot, quiet = false) {
  mkdirSync(SAVE_DIR, { recursive: true });
  writeFileSync(savePath, JSON.stringify(snap, null, 2));
  if (!quiet) console.log(dim(`Saved to ${savePath}`));
}

function loadSave(): GameSession | undefined {
  try {
    const snap = JSON.parse(readFileSync(savePath, "utf8")) as SessionSnapshot;
    console.log(dim("Loaded save."));
    return GameSession.restore(world, provider, snap);
  } catch {
    console.log(dim("No usable save found."));
    return undefined;
  }
}

main();

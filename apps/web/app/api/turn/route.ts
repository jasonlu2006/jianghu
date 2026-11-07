import type { Action } from "@murim/engine";
import { GameSession, providerFromEnv, type SessionSnapshot } from "@murim/narrator";
import { getWorld } from "@murim/worlds";
import { NextResponse } from "next/server";

/**
 * POST /api/turn
 *   { worldId, snapshot?, input?: string, action?: Action }
 * No snapshot = start a new game and return the opening.
 * Stateless: the client stores the snapshot (localStorage) and sends it back.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      worldId?: string;
      snapshot?: SessionSnapshot;
      input?: string;
      action?: Action;
    };
    const world = getWorld(body.worldId ?? "azure-peak");
    const provider = providerFromEnv();

    if (!body.snapshot) {
      const session = GameSession.start(world, provider);
      const narration = await session.opening();
      return NextResponse.json({
        narration,
        snapshot: session.snapshot(),
        suggestions: session.suggestions(),
        provider: provider.name,
      });
    }

    const session = GameSession.restore(world, provider, body.snapshot);
    const input = body.action ?? body.input?.slice(0, 500);
    if (!input) return NextResponse.json({ error: "input or action required" }, { status: 400 });

    const out = await session.takeTurn(input);
    return NextResponse.json({
      narration: out.narration,
      snapshot: session.snapshot(),
      suggestions: out.suggestions,
      regressed: out.result.regressed,
      provider: provider.name,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

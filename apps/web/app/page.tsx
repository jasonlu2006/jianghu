"use client";

import type { Action, SuggestedAction } from "@murim/engine";
import type { SessionSnapshot } from "@murim/narrator";
import { useEffect, useRef, useState } from "react";

type Msg = { kind: "narrator" | "player" | "system" | "error"; text: string };

interface TurnResponse {
  narration: string;
  snapshot: SessionSnapshot;
  suggestions: SuggestedAction[];
  regressed?: boolean;
  provider: string;
  error?: string;
}

const WORLD = "azure-peak";
const SAVE_KEY = `jianghu:${WORLD}`;

function loadSave(): { snapshot: SessionSnapshot; messages: Msg[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Play() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedAction[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const save = loadSave();
    if (save) {
      setSnapshot(save.snapshot);
      setMessages(save.messages);
      void send({}, save.snapshot, save.messages, true);
    } else {
      void send({}, null, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(
    payload: { input?: string; action?: Action },
    snap = snapshot,
    current = messages,
    suggestionsOnly = false,
  ) {
    if (suggestionsOnly) {
      // Resumed a save: nothing to send yet; suggestions come with the next turn.
      setSuggestions([{ label: "Look around", action: { type: "observe" } }]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worldId: WORLD, snapshot: snap ?? undefined, ...payload }),
      });
      const data = (await res.json()) as TurnResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? res.statusText);

      const next: Msg[] = [...current, { kind: "narrator", text: data.narration }];
      if (data.regressed)
        next.push({ kind: "system", text: `Regression · Loop ${data.snapshot.state.loop + 1}` });
      setMessages(next);
      setSnapshot(data.snapshot);
      setSuggestions(data.suggestions);
      setProvider(data.provider);
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ snapshot: data.snapshot, messages: next.slice(-80) }),
      );
    } catch (err) {
      setMessages([
        ...current,
        { kind: "error", text: `Something went wrong: ${(err as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function act(text: string, action?: Action) {
    if (busy || !snapshot) return;
    const next: Msg[] = [...messages, { kind: "player", text }];
    setMessages(next);
    setInput("");
    void send(action ? { action } : { input: text }, snapshot, next);
  }

  function newGame() {
    if (!confirm("Start over? Your current save will be erased.")) return;
    localStorage.removeItem(SAVE_KEY);
    setSnapshot(null);
    setMessages([]);
    void send({}, null, []);
  }

  const s = snapshot?.state;
  return (
    <main className="app">
      <header className="status">
        {s ? (
          <>
            <span>
              Day <b>{s.day}</b>
            </span>
            <span>
              Loop <b>{s.loop + 1}</b>
            </span>
            <span>
              Qi <b>{s.player.qi}</b>
            </span>
            <span>
              HP <b>{s.player.hp}</b>/{s.player.maxHp}
            </span>
            <span>
              Memories <b>{s.knowledge.length}</b>
            </span>
          </>
        ) : (
          <span>Entering the jianghu…</span>
        )}
        {provider === "mock" && <span title="Set ANTHROPIC_API_KEY in .env">offline narrator</span>}
        <button onClick={newGame} disabled={busy}>
          New game
        </button>
      </header>

      <div className="log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.kind}`}>
            {m.text}
          </div>
        ))}
        {busy && <div className="msg system">…</div>}
      </div>

      <div className="chips">
        {suggestions.map((sg) => (
          <button key={sg.label} disabled={busy} onClick={() => act(sg.label, sg.action)}>
            {sg.label}
          </button>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) act(input.trim());
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What do you do?"
          disabled={busy || !snapshot}
          maxLength={500}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Act
        </button>
      </form>
    </main>
  );
}

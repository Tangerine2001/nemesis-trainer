"use client";

import {useEffect, useMemo, useState} from "react";
import {ClipboardPaste, FlaskConical, Play, RefreshCcw, RotateCcw, Share2, Shield, Swords, Wand2} from "lucide-react";
import {createAudit} from "@/lib/nemesis";
import {SAMPLE_TEAM} from "@/lib/sample-teams";
import {decodeSharePayload} from "@/lib/share/payload";
import type {AuditResult, BattleChoice, BattleResponse, BattleSnapshot, TrainerStyle} from "@/lib/types";

const STYLE_OPTIONS: TrainerStyle[] = ["auto", "Fast Pressure", "Wallbreaker", "Setup Snowball"];

export default function Home() {
  const [rawTeam, setRawTeam] = useState(SAMPLE_TEAM);
  const [seed, setSeed] = useState("nemesis-demo");
  const [style, setStyle] = useState<TrainerStyle>("auto");
  const [copied, setCopied] = useState(false);
  const [battle, setBattle] = useState<BattleSnapshot | undefined>();
  const [battleChoices, setBattleChoices] = useState<string[]>([]);
  const [battleError, setBattleError] = useState<string | undefined>();
  const [battleBusy, setBattleBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("s");
    if (!code) return;

    try {
      const payload = decodeSharePayload(code);
      setRawTeam(payload.rawTeam);
      setSeed(payload.seed);
      setStyle(payload.style);
    } catch {
      // Ignore invalid shared payloads; the sample team remains usable.
    }
  }, []);

  const audit = useMemo<AuditResult | undefined>(() => {
    try {
      return createAudit({rawTeam, seed, style});
    } catch {
      return undefined;
    }
  }, [rawTeam, seed, style]);

  const shareUrl = audit && typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?s=${audit.shareCode}` : "";

  async function copyShareUrl() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function startBattle() {
    setBattleBusy(true);
    setBattleError(undefined);
    try {
      const response = await postBattle("/api/battle/start", {rawTeam, seed, style});
      setBattle(response.snapshot);
      setBattleChoices(response.userChoices);
    } catch (error) {
      setBattleError(error instanceof Error ? error.message : "Unable to start battle.");
    } finally {
      setBattleBusy(false);
    }
  }

  async function chooseBattleAction(choice: string) {
    setBattleBusy(true);
    setBattleError(undefined);
    try {
      const response = await postBattle("/api/battle/turn", {rawTeam, seed, style, userChoices: battleChoices, choice});
      setBattle(response.snapshot);
      setBattleChoices(response.userChoices);
    } catch (error) {
      setBattleError(error instanceof Error ? error.message : "Unable to advance battle.");
    } finally {
      setBattleBusy(false);
    }
  }

  function resetBattle() {
    setBattle(undefined);
    setBattleChoices([]);
    setBattleError(undefined);
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="Nemesis Trainer workspace">
        <div className="input-panel">
          <div className="brand-row">
            <div>
              <p className="eyebrow">Nemesis Trainer</p>
              <h1>Paste your team. Meet the trainer built to beat it.</h1>
            </div>
            <Swords aria-hidden="true" className="brand-icon" />
          </div>

          <label className="field-label" htmlFor="team-import">
            Showdown team import
          </label>
          <textarea
            id="team-import"
            value={rawTeam}
            onChange={(event) => setRawTeam(event.target.value)}
            spellCheck={false}
            className="team-input"
          />

          <div className="controls">
            <label>
              <span>Seed</span>
              <input value={seed} onChange={(event) => setSeed(event.target.value)} />
            </label>
            <label>
              <span>Trainer style</span>
              <select value={style} onChange={(event) => setStyle(event.target.value as TrainerStyle)}>
                {STYLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === "auto" ? "Auto-select" : option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="button-row">
            <button type="button" onClick={() => setRawTeam(SAMPLE_TEAM)}>
              <ClipboardPaste aria-hidden="true" />
              Sample
            </button>
            <button type="button" onClick={() => setSeed(`seed-${Math.floor(Math.random() * 1_000_000)}`)}>
              <RefreshCcw aria-hidden="true" />
              Reseed
            </button>
            <button type="button" onClick={copyShareUrl} disabled={!audit}>
              <Share2 aria-hidden="true" />
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        </div>

        <div className="result-panel">
          {battle ? (
            <BattleView
              snapshot={battle}
              busy={battleBusy}
              error={battleError}
              onChoose={chooseBattleAction}
              onReset={resetBattle}
            />
          ) : audit ? (
            <AuditView audit={audit} battleBusy={battleBusy} battleError={battleError} onStartBattle={startBattle} />
          ) : (
            <EmptyState />
          )}
        </div>
      </section>
    </main>
  );
}

async function postBattle(path: string, body: unknown): Promise<BattleResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body)
  });
  const json = await response.json();
  if (!response.ok) {
    const message = json.error ?? json.snapshot?.errors?.join(" ") ?? "Battle request failed.";
    throw new Error(message);
  }
  return json as BattleResponse;
}

function AuditView({
  audit,
  battleBusy,
  battleError,
  onStartBattle
}: {
  audit: AuditResult;
  battleBusy: boolean;
  battleError?: string;
  onStartBattle: () => void;
}) {
  const topSignals = audit.analysis.signals.slice(0, 5);

  return (
    <>
      <div className="summary-strip">
        <div>
          <span>Boss</span>
          <strong>{audit.boss.name}</strong>
        </div>
        <div>
          <span>Difficulty</span>
          <strong>{audit.boss.difficulty}</strong>
        </div>
        <div>
          <span>Likely lead</span>
          <strong>{audit.boss.likelyLead}</strong>
        </div>
      </div>

      <div className="battle-cta">
        <div>
          <span>Playable challenge</span>
          <p>Battle the generated trainer in a deterministic Showdown-backed singles match.</p>
          {battleError ? <strong>{battleError}</strong> : null}
        </div>
        <button type="button" onClick={onStartBattle} disabled={battleBusy}>
          <Play aria-hidden="true" />
          {battleBusy ? "Starting" : "Battle trainer"}
        </button>
      </div>

      <section className="section-block">
        <div className="section-heading">
          <FlaskConical aria-hidden="true" />
          <h2>Weakness Audit</h2>
        </div>
        <div className="signal-list">
          {topSignals.map((signal) => (
            <article key={signal.id} className="signal-item">
              <div className="signal-meter" style={{"--score": `${signal.severity}%`} as React.CSSProperties} />
              <div>
                <h3>{signal.label}</h3>
                <p>{signal.evidence}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <Wand2 aria-hidden="true" />
          <h2>Boss Roster</h2>
        </div>
        <div className="roster-grid">
          {audit.boss.roster.map((member) => (
            <article key={member.species} className="roster-card">
              <div>
                <h3>{member.species}</h3>
                <p>{member.role}</p>
              </div>
              <span>{member.item}</span>
              <ul>
                {member.moves.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block split-block">
        <TextList title="First Plan" items={audit.boss.firstThreeTurns} />
        <TextList title="Why It Is Hard" items={audit.boss.whyItBeatsYou} />
        <TextList title="Best Counterplay" items={audit.boss.bestCounterplay} />
        <div className="edit-callout">
          <span>Suggested edit</span>
          <p>{audit.boss.suggestedTeamEdit}</p>
        </div>
      </section>
    </>
  );
}

function BattleView({
  snapshot,
  busy,
  error,
  onChoose,
  onReset
}: {
  snapshot: BattleSnapshot;
  busy: boolean;
  error?: string;
  onChoose: (choice: string) => void;
  onReset: () => void;
}) {
  return (
    <>
      <div className="battle-header">
        <div>
          <span>Turn {snapshot.turn || 1}</span>
          <h2>{snapshot.ended ? (snapshot.winner === "user" ? "You defeated the Nemesis." : "The Nemesis won.") : "Battle in progress"}</h2>
        </div>
        <button type="button" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          Audit
        </button>
      </div>

      {error ? <div className="battle-error">{error}</div> : null}
      {snapshot.errors.map((message) => (
        <div className="battle-error" key={message}>
          {message}
        </div>
      ))}

      <section className="battle-board">
        <BattleSide title="Nemesis" side={snapshot.opponent} />
        <BattleSide title="You" side={snapshot.user} />
      </section>

      <section className="section-block action-panel">
        <div className="section-heading">
          <Shield aria-hidden="true" />
          <h2>Choose Action</h2>
        </div>
        <div className="choice-grid">
          {snapshot.choices.length ? (
            snapshot.choices.map((choice) => (
              <button key={choice.id} type="button" onClick={() => onChoose(choice.id)} disabled={busy || choice.disabled}>
                {choice.kind === "move" ? <Swords aria-hidden="true" /> : <RefreshCcw aria-hidden="true" />}
                {choice.label}
              </button>
            ))
          ) : (
            <p>{snapshot.ended ? "Battle complete." : "Waiting for the next legal choice."}</p>
          )}
        </div>
      </section>

      <section className="section-block battle-log">
        <h2>Battle Log</h2>
        <ol>
          {snapshot.log.map((entry) => (
            <li key={entry.id} className={`log-${entry.kind}`}>
              {entry.text}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function BattleSide({title, side}: {title: string; side: BattleSnapshot["user"]}) {
  const active = side.pokemon.find((pokemon) => pokemon.active);

  return (
    <article className="battle-side">
      <div className="battle-side-heading">
        <span>{title}</span>
        <strong>{active?.species ?? "No active Pokemon"}</strong>
        <p>{active?.condition ?? ""}</p>
      </div>
      <div className="bench-list">
        {side.pokemon.map((pokemon) => (
          <div key={pokemon.ident} className={pokemon.active ? "bench-mon active" : pokemon.fainted ? "bench-mon fainted" : "bench-mon"}>
            <span>{pokemon.species}</span>
            <small>{pokemon.condition}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function TextList({title, items}: {title: string; items: string[]}) {
  return (
    <div className="text-list">
      <h2>{title}</h2>
      <ol>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Swords aria-hidden="true" />
      <h2>Paste a supported Showdown export to generate the matchup.</h2>
      <p>The MVP parser supports common six-member export text with items, abilities, EVs, Tera Types, natures, and moves.</p>
    </div>
  );
}

"use client";

import {useEffect, useMemo, useState, type ReactNode} from "react";
import {
  ArrowRight,
  Clipboard,
  ClipboardCheck,
  Gauge,
  Link,
  Loader2,
  Search,
  Swords,
  TriangleAlert,
  Wand2
} from "lucide-react";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Textarea} from "@/components/ui/textarea";
import {
  draftToShowdownExport,
  leagueRulesFromDraft,
  normalizeDraft,
  showdownExportToDraft,
  slotCompletion,
  statTotal,
  toId,
  validateDraftBasics
} from "@/features/team-builder/draft";
import {STAT_IDS, STAT_LABELS, type BuilderData, type BuilderSpecies, type DraftIssue, type DraftLeagueRulesState, type TeamDraft, type TeamSlotDraft, type ValidationResponse} from "@/features/team-builder/types";
import type {AuditResult, LeagueRules} from "@/lib/types";

const SAMPLE_TEAM = `Great Tusk @ Heavy-Duty Boots
Ability: Protosynthesis
Tera Type: Water
EVs: 252 Atk / 4 Def / 252 Spe
Jolly Nature
- Headlong Rush
- Close Combat
- Rapid Spin
- Knock Off

Gholdengo @ Choice Scarf
Ability: Good as Gold
Tera Type: Steel
EVs: 4 Def / 252 SpA / 252 Spe
Timid Nature
- Make It Rain
- Shadow Ball
- Trick
- Recover`;

const DRAFT_STORAGE_KEY = "nemesis-trainer:team-draft:v1";
const DEFAULT_VALIDATION: ValidationResponse = {ok: false, packed: "", problems: [], issues: []};

function readTeamBlocks(rawTeam: string) {
  return rawTeam
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function memberName(block: string) {
  const header = block.split("\n")[0] ?? "Unknown";
  return header.split("@")[0]?.trim() || "Unknown";
}

export default function Home() {
  const [tab, setTab] = useState<"paste" | "build">("paste");
  const [rawTeam, setRawTeam] = useState(SAMPLE_TEAM);
  const [draft, setDraft] = useState<TeamDraft>(() => normalizeDraft(showdownExportToDraft(SAMPLE_TEAM)));
  const [activeSlot, setActiveSlot] = useState(0);
  const [builderData, setBuilderData] = useState<BuilderData | null>(null);
  const [validation, setValidation] = useState<ValidationResponse>(DEFAULT_VALIDATION);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<"" | "validate" | "audit" | "import" | "share">("");
  const [hydrated, setHydrated] = useState(false);

  const builderExport = useMemo(() => draftToShowdownExport(draft), [draft]);
  const activeRawTeam = tab === "build" ? builderExport : rawTeam;
  const teamBlocks = useMemo(() => readTeamBlocks(activeRawTeam), [activeRawTeam]);
  const leagueRuleState = useMemo(() => leagueRulesFromDraft(draft, activeRawTeam), [activeRawTeam, draft]);
  const basicIssues = useMemo(() => [...(tab === "build" ? validateDraftBasics(draft) : []), ...leagueRuleState.issues], [draft, leagueRuleState.issues, tab]);
  const hasFullTeam = teamBlocks.length >= 6;
  const topConcern = audit?.analysis.signals[0]?.label ?? (hasFullTeam ? "Ready for Showdown validation" : "Incomplete team");

  useEffect(() => {
    let cancelled = false;
    fetch("/data/builder/gen9ou.json")
      .then((response) => response.json() as Promise<BuilderData>)
      .then((data) => {
        if (!cancelled) setBuilderData(data);
      })
      .catch(() => {
        if (!cancelled) setStatus("Could not load builder data.");
      });

    queueMicrotask(() => {
      const shared = readSharedState();
      if (shared.rawTeam) {
        setRawTeam(shared.rawTeam);
        setDraft(normalizeDraft({...showdownExportToDraft(shared.rawTeam), leagueRules: shared.leagueRules}));
        setTab("build");
        setStatus("Loaded shared team.");
      } else {
        const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
          try {
            setDraft(normalizeDraft(JSON.parse(saved) as TeamDraft));
            setTab("build");
            setStatus("Restored local draft.");
          } catch {
            window.localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        }
      }

      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  function updateDraft(next: TeamDraft) {
    setDraft(normalizeDraft(next));
    setValidation(DEFAULT_VALIDATION);
    setAudit(null);
  }

  async function loadPasteIntoBuilder() {
    setBusyAction("import");
    setStatus("");
    try {
      const response = await fetch("/api/team/import", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({rawTeam})
      });
      const body = (await response.json()) as {draft?: TeamDraft; error?: string};
      if (!response.ok || !body.draft) throw new Error(body.error ?? "Import failed.");
      updateDraft({...body.draft, seed: draft.seed, style: draft.style});
      setTab("build");
      setStatus("Loaded paste into builder.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function validateActiveTeam() {
    setBusyAction("validate");
    setStatus("");
    try {
      const response = await fetch("/api/team/validate", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(teamRequestPayload(tab === "build" ? {draft} : {rawTeam: activeRawTeam}, leagueRuleState.leagueRules))
      });
      const body = (await response.json()) as ValidationResponse & {error?: string};
      if (!response.ok) throw new Error(body.error ?? "Validation failed.");
      const nextValidation = withLocalIssues(body, leagueRuleState.issues);
      setValidation(nextValidation);
      setStatus(nextValidation.ok ? "Showdown validation passed." : "Showdown found issues to fix.");
      return nextValidation;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Validation failed.";
      setValidation({...DEFAULT_VALIDATION, problems: [message]});
      setStatus(message);
      return null;
    } finally {
      setBusyAction("");
    }
  }

  async function generateNemesis() {
    setBusyAction("audit");
    setStatus("");
    setAudit(null);
    try {
      const validationResult = await validateForAudit(
        teamRequestPayload(tab === "build" ? {draft} : {rawTeam: activeRawTeam}, leagueRuleState.leagueRules),
        leagueRuleState.issues
      );
      setValidation(validationResult);
      if (!validationResult.ok) {
        setStatus("Fix validation issues before generating a Nemesis trainer.");
        return;
      }

      const response = await fetch("/api/audit", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({rawTeam: activeRawTeam, seed: draft.seed, style: draft.style, format: "gen9ou", leagueRules: leagueRuleState.leagueRules})
      });
      const body = (await response.json()) as {audit?: AuditResult; error?: string};
      if (!response.ok || !body.audit) throw new Error(body.error ?? "Audit failed.");
      setAudit(body.audit);
      setStatus("Generated Nemesis trainer.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Audit failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function shareActiveTeam() {
    setBusyAction("share");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("team", encodeSharePayload(activeRawTeam, draft.leagueRules));
      await navigator.clipboard?.writeText(url.toString());
      window.history.replaceState(null, "", url);
      setStatus("Share URL copied and added to the address bar.");
    } catch {
      setStatus("Share URL is available in the address bar.");
    } finally {
      setBusyAction("");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Nemesis Trainer</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-foreground sm:text-3xl">
            Paste or build your team. Meet the trainer built to beat it.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Gen 9 OU</Badge>
          <Badge variant="outline">Showdown validation</Badge>
          <Badge variant="outline">Local drafts</Badge>
        </div>
      </header>

      <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <Card className="min-h-[620px]">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wand2 className="size-4" />
                  Team Workspace
                </CardTitle>
                <CardDescription>Paste a Showdown export or build a six-slot draft from Showdown data.</CardDescription>
              </div>
              <div className="inline-flex rounded-md border bg-muted p-1">
                <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
                  Paste
                </TabButton>
                <TabButton active={tab === "build"} onClick={() => setTab("build")}>
                  Build
                </TabButton>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {tab === "paste" ? (
              <PastePanel
                rawTeam={rawTeam}
                teamCount={teamBlocks.length}
                busy={busyAction}
                onRawTeamChange={(next) => {
                  setRawTeam(next);
                  setValidation(DEFAULT_VALIDATION);
                  setAudit(null);
                }}
                onSample={() => {
                  setRawTeam(SAMPLE_TEAM);
                  setDraft(normalizeDraft(showdownExportToDraft(SAMPLE_TEAM)));
                  setValidation(DEFAULT_VALIDATION);
                  setAudit(null);
                }}
                onLoadBuilder={loadPasteIntoBuilder}
                onValidate={validateActiveTeam}
                onGenerate={generateNemesis}
              />
            ) : (
              <BuildPanel
                data={builderData}
                draft={draft}
                activeSlot={activeSlot}
                issues={[...basicIssues, ...validation.issues]}
                onActiveSlotChange={setActiveSlot}
                onDraftChange={updateDraft}
                onExportToPaste={() => {
                  setRawTeam(builderExport);
                  setTab("paste");
                  setStatus("Exported builder draft to paste view.");
                }}
                onValidate={validateActiveTeam}
                onGenerate={generateNemesis}
                busy={busyAction}
              />
            )}
          </CardContent>
        </Card>

        <AuditPanel
          audit={audit}
          validation={validation}
          teamBlocks={teamBlocks}
          status={status}
          topConcern={topConcern}
          busy={busyAction}
          draft={draft}
          activeRawTeam={activeRawTeam}
          onDraftChange={updateDraft}
          onShare={shareActiveTeam}
          onGenerate={generateNemesis}
        />
      </section>
    </main>
  );
}

function PastePanel({
  rawTeam,
  teamCount,
  busy,
  onRawTeamChange,
  onSample,
  onLoadBuilder,
  onValidate,
  onGenerate
}: {
  rawTeam: string;
  teamCount: number;
  busy: string;
  onRawTeamChange: (value: string) => void;
  onSample: () => void;
  onLoadBuilder: () => void;
  onValidate: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="flex min-h-[500px] flex-col gap-4">
      <Textarea
        value={rawTeam}
        onChange={(event) => onRawTeamChange(event.target.value)}
        className="min-h-[430px] flex-1 resize-none font-mono text-sm leading-6"
        spellCheck={false}
        aria-label="Team export"
      />
      <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{teamCount}</span> of 6 members detected
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onSample}>
            <Clipboard className="size-4" />
            Sample
          </Button>
          <Button type="button" variant="outline" onClick={onLoadBuilder} disabled={busy === "import"}>
            {busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Load Builder
          </Button>
          <Button type="button" variant="outline" onClick={onValidate} disabled={busy === "validate"}>
            {busy === "validate" ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            Validate
          </Button>
          <Button type="button" onClick={onGenerate} disabled={busy === "audit"}>
            {busy === "audit" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Generate Nemesis
          </Button>
        </div>
      </div>
    </div>
  );
}

function BuildPanel({
  data,
  draft,
  activeSlot,
  issues,
  busy,
  onActiveSlotChange,
  onDraftChange,
  onExportToPaste,
  onValidate,
  onGenerate
}: {
  data: BuilderData | null;
  draft: TeamDraft;
  activeSlot: number;
  issues: {severity: "error" | "warning"; message: string; slot?: number}[];
  busy: string;
  onActiveSlotChange: (slot: number) => void;
  onDraftChange: (draft: TeamDraft) => void;
  onExportToPaste: () => void;
  onValidate: () => void;
  onGenerate: () => void;
}) {
  const active = draft.slots[activeSlot];
  const activeSpecies = findSpecies(data, active.species);
  const slotIssues = issues.filter((issue) => issue.slot === activeSlot);
  const teamIssues = issues.filter((issue) => issue.slot === undefined);

  function updateSlot(nextSlot: TeamSlotDraft) {
    const slots = draft.slots.map((slot, index) => (index === activeSlot ? nextSlot : slot));
    onDraftChange({...draft, slots});
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="grid gap-2">
          {draft.slots.map((slot, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onActiveSlotChange(index)}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                activeSlot === index ? "border-primary bg-accent/60" : "bg-background hover:bg-muted"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{slot.species || `Slot ${index + 1}`}</span>
                <Badge variant={slotCompletion(slot) === 100 ? "default" : "outline"}>{slotCompletion(slot)}%</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">{slot.item || "No item"} · {slot.moves.filter(Boolean).length}/4 moves</p>
            </button>
          ))}
        </div>
        <div className="rounded-md border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
          Draft autosaves locally. Showdown validation runs when you validate, export, or generate.
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Species">
            <input
              list="builder-species"
              value={active.species}
              onChange={(event) => {
                const species = findSpecies(data, event.target.value);
                updateSlot({
                  ...active,
                  species: event.target.value,
                  ability: species?.abilities[0] ?? active.ability,
                  teraType: species?.types[0] ?? active.teraType
                });
              }}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Great Tusk"
            />
            <datalist id="builder-species">{data?.species.map((species) => <option key={species.id} value={species.name} />)}</datalist>
          </Field>
          <Field label="Nickname">
            <input
              value={active.nickname}
              onChange={(event) => updateSlot({...active, nickname: event.target.value})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Optional"
            />
          </Field>
          <Field label="Item">
            <input
              list="builder-items"
              value={active.item}
              onChange={(event) => updateSlot({...active, item: event.target.value})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Heavy-Duty Boots"
            />
            <datalist id="builder-items">{data?.items.map((item) => <option key={item.id} value={item.name} />)}</datalist>
          </Field>
          <Field label="Ability">
            <select
              value={active.ability}
              onChange={(event) => updateSlot({...active, ability: event.target.value})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Select ability</option>
              {(activeSpecies?.abilities.length ? activeSpecies.abilities : data?.abilities.map((ability) => ability.name) ?? []).map((ability) => (
                <option key={ability} value={ability}>{ability}</option>
              ))}
            </select>
          </Field>
          <Field label="Tera Type">
            <select
              value={active.teraType}
              onChange={(event) => updateSlot({...active, teraType: event.target.value})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Select type</option>
              {data?.types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Nature">
            <select
              value={active.nature}
              onChange={(event) => updateSlot({...active, nature: event.target.value})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {data?.natures.map((nature) => <option key={nature.id} value={nature.name}>{nature.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Level">
            <input
              type="number"
              min={1}
              max={100}
              value={active.level}
              onChange={(event) => updateSlot({...active, level: Number.parseInt(event.target.value, 10) || 100})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </Field>
          <Field label="Gender">
            <select
              value={active.gender}
              onChange={(event) => updateSlot({...active, gender: event.target.value as TeamSlotDraft["gender"]})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">Default</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="N">Genderless</option>
            </select>
          </Field>
        </div>

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Moves</p>
            <p className="text-xs text-muted-foreground">{activeSpecies ? `${activeSpecies.moves.length} species moves` : "All moves"}</p>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {active.moves.map((move, index) => (
              <input
                key={index}
                list={`builder-moves-${activeSlot}`}
                value={move}
                onChange={(event) => {
                  const moves = active.moves.map((candidate, moveIndex) => (moveIndex === index ? event.target.value : candidate));
                  updateSlot({...active, moves});
                }}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                placeholder={`Move ${index + 1}`}
              />
            ))}
            <datalist id={`builder-moves-${activeSlot}`}>
              {moveOptions(data, activeSpecies).map((move) => <option key={move.id} value={move.name} />)}
            </datalist>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <StatEditor title={`EVs · ${statTotal(active.evs)}/510`} max={252} stats={active.evs} onChange={(evs) => updateSlot({...active, evs})} />
          <StatEditor title="IVs" max={31} stats={active.ivs} onChange={(ivs) => updateSlot({...active, ivs})} />
        </div>

        {(slotIssues.length > 0 || teamIssues.length > 0) && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {[...teamIssues, ...slotIssues].slice(0, 5).map((issue, index) => (
              <p key={index} className={issue.severity === "error" ? "text-destructive" : "text-muted-foreground"}>{issue.message}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onExportToPaste}>
            <Clipboard className="size-4" />
            Export to Paste
          </Button>
          <Button type="button" variant="outline" onClick={onValidate} disabled={busy === "validate"}>
            {busy === "validate" ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            Validate
          </Button>
          <Button type="button" onClick={onGenerate} disabled={busy === "audit"}>
            {busy === "audit" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Generate Nemesis
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuditPanel({
  audit,
  validation,
  teamBlocks,
  status,
  topConcern,
  busy,
  draft,
  activeRawTeam,
  onDraftChange,
  onShare,
  onGenerate
}: {
  audit: AuditResult | null;
  validation: ValidationResponse;
  teamBlocks: string[];
  status: string;
  topConcern: string;
  busy: string;
  draft: TeamDraft;
  activeRawTeam: string;
  onDraftChange: (draft: TeamDraft) => void;
  onShare: () => void;
  onGenerate: () => void;
}) {
  const hasFullTeam = teamBlocks.length >= 6;
  const visibleIssues = mergeIssues([...validation.issues, ...(audit?.leagueRuleIssues ?? [])]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="size-4" />
            Audit Preview
          </CardTitle>
          <CardDescription>Weakness signals stay explainable before the boss roster appears.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{topConcern}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {audit?.analysis.signals[0]?.evidence ?? (hasFullTeam ? "Validate and generate to run the deterministic matchup audit." : "Add remaining members to improve the matchup read.")}
                </p>
              </div>
              <Badge variant={validation.ok ? "default" : "secondary"}>{validation.ok ? "Legal" : hasFullTeam ? "Draft" : "Partial"}</Badge>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="Members" value={`${teamBlocks.length}/6`} />
            <Metric label="Style" value={audit?.boss.style ?? "Auto"} />
            <Metric label="Risk" value={audit?.boss.difficulty ?? (hasFullTeam ? "Pending" : "Draft")} />
          </div>

          <div className="grid gap-2">
            <Field label="Seed">
              <input
                value={draft.seed}
                onChange={(event) => onDraftChange({...draft, seed: event.target.value})}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </Field>
            <Field label="Trainer Style">
              <select
                value={draft.style}
                onChange={(event) => onDraftChange({...draft, style: event.target.value as TeamDraft["style"]})}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="auto">Auto</option>
                <option value="Fast Pressure">Fast Pressure</option>
                <option value="Wallbreaker">Wallbreaker</option>
                <option value="Setup Snowball">Setup Snowball</option>
              </select>
            </Field>
            <AdvancedLeagueRules draft={draft} activeRawTeam={activeRawTeam} onDraftChange={onDraftChange} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onShare} disabled={!activeRawTeam.trim() || busy === "share"}>
              {busy === "share" ? <Loader2 className="size-4 animate-spin" /> : <Link className="size-4" />}
              Share
            </Button>
            <Button type="button" onClick={onGenerate} disabled={!activeRawTeam.trim() || busy === "audit"}>
              {busy === "audit" ? <Loader2 className="size-4 animate-spin" /> : <Swords className="size-4" />}
              Generate
            </Button>
          </div>

          {status && <p className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">{status}</p>}
          {validation.problems.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {validation.problems.slice(0, 6).map((problem, index) => <p key={index}>{problem}</p>)}
            </div>
          )}
          {visibleIssues.length > 0 && (
            <div className="rounded-md border border-amber-300/60 bg-amber-50/70 p-3 text-sm text-amber-950">
              {visibleIssues.slice(0, 6).map((issue, index) => (
                <p key={index} className={issue.severity === "error" ? "font-medium text-destructive" : undefined}>{issue.message}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Swords className="size-4" />
            Nemesis Roster
          </CardTitle>
          <CardDescription>{audit ? audit.boss.name : "A deterministic boss team preview generated from the matchup shape."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(audit?.boss.roster ?? ["Hazard Lead", "Speed Check", "Pivot Breaker", "Cleaner"]).map((entry, index) => {
            const species = typeof entry === "string" ? entry : entry.species;
            const detail = typeof entry === "string" ? `Targets ${teamBlocks[index] ? memberName(teamBlocks[index]) : "unfilled slot"}` : `${entry.role} · ${entry.item}`;
            return (
              <div key={`${species}-${index}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{species}</p>
                  <p className="truncate text-xs text-muted-foreground">{detail}</p>
                </div>
                <Badge variant="outline">Slot {index + 1}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4" />
            Team Signals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(audit?.analysis.signals ?? []).slice(0, 4).map((signal) => (
            <div key={signal.id} className="rounded-md border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{signal.label}</p>
                <Badge variant="secondary">{signal.severity}</Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{signal.evidence}</p>
            </div>
          ))}
          {!audit && <p className="text-sm leading-6 text-muted-foreground">Validate and generate to see type, speed, role, and coverage weaknesses.</p>}
          {audit?.boss.suggestedTeamEdit && (
            <div className="rounded-md border bg-accent/40 px-3 py-2 text-sm leading-6">{audit.boss.suggestedTeamEdit}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdvancedLeagueRules({
  draft,
  activeRawTeam,
  onDraftChange
}: {
  draft: TeamDraft;
  activeRawTeam: string;
  onDraftChange: (draft: TeamDraft) => void;
}) {
  const rules = draft.leagueRules;
  const resolved = leagueRulesFromDraft(draft, activeRawTeam);
  const selectedMegaSpecies = resolved.megaCandidates.includes(rules.selectedMegaSpecies) ? rules.selectedMegaSpecies : "";

  function updateRules(next: Partial<DraftLeagueRulesState>) {
    onDraftChange({...draft, leagueRules: {...rules, ...next}});
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        <span>Advanced League Rules</span>
        <input
          type="checkbox"
          checked={rules.enabled}
          onChange={(event) => updateRules({enabled: event.target.checked})}
          className="size-4 accent-primary"
          aria-label="Enable draft Mega rules"
        />
      </label>

      {rules.enabled && (
        <div className="mt-3 grid gap-3">
          <Field label="Mega Stones">
            <textarea
              value={rules.megaStoneMappingsText}
              onChange={(event) => updateRules({megaStoneMappingsText: event.target.value})}
              className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder={"Mega Delphox = Delphoxite\nMega Golurk = Golurkite"}
              spellCheck={false}
            />
          </Field>
          <Field label="Selected Mega">
            <select
              value={selectedMegaSpecies}
              onChange={(event) => updateRules({selectedMegaSpecies: event.target.value})}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <option value="">No selected Mega</option>
              {resolved.megaCandidates.map((species) => (
                <option key={species} value={species}>{species}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Forced stones</Badge>
            <Badge variant="outline">One Mega</Badge>
          </div>
        </div>
      )}
    </div>
  );
}

function StatEditor({title, stats, max, onChange}: {title: string; stats: Record<string, number>; max: number; onChange: (stats: TeamSlotDraft["evs"]) => void}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {STAT_IDS.map((stat) => (
          <label key={stat} className="grid grid-cols-[42px_minmax(0,1fr)] items-center gap-2 text-xs text-muted-foreground">
            <span>{STAT_LABELS[stat]}</span>
            <input
              type="number"
              min={0}
              max={max}
              value={stats[stat]}
              onChange={(event) => onChange({...stats, [stat]: Number.parseInt(event.target.value, 10) || 0} as TeamSlotDraft["evs"])}
              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Metric({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-md border bg-background px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function Field({label, children}: {label: string; children: ReactNode}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: ReactNode}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function findSpecies(data: BuilderData | null, value: string): BuilderSpecies | undefined {
  const id = toId(value);
  return data?.species.find((species) => species.id === id || toId(species.name) === id);
}

function moveOptions(data: BuilderData | null, species: BuilderSpecies | undefined) {
  if (!data) return [];
  if (!species) return data.moves.slice(0, 120);
  const speciesMoves = new Set(species.moves);
  return data.moves.filter((move) => speciesMoves.has(move.id));
}

async function validateForAudit(payload: TeamRequestPayload, localIssues: DraftIssue[]) {
  const response = await fetch("/api/team/validate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const body = (await response.json()) as ValidationResponse & {error?: string};
  if (!response.ok) throw new Error(body.error ?? "Validation failed.");
  return withLocalIssues(body, localIssues);
}

interface SharedPagePayload {
  rawTeam?: string;
  leagueRules?: DraftLeagueRulesState;
}

interface TeamRequestPayload {
  draft?: TeamDraft;
  rawTeam?: string;
  leagueRules?: LeagueRules;
}

function teamRequestPayload(payload: {draft?: TeamDraft; rawTeam?: string}, leagueRules: LeagueRules | undefined): TeamRequestPayload {
  return leagueRules ? {...payload, leagueRules} : payload;
}

type DisplayIssue = Pick<DraftIssue, "severity" | "message" | "slot">;

function withLocalIssues(validation: ValidationResponse, localIssues: DraftIssue[]): ValidationResponse {
  return {
    ...validation,
    ok: validation.ok && localIssues.every((issue) => issue.severity !== "error"),
    issues: mergeIssues([...localIssues, ...validation.issues])
  };
}

function mergeIssues<TIssue extends DisplayIssue>(issues: TIssue[]): TIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.slot ?? ""}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function encodeSharePayload(rawTeam: string, leagueRules: DraftLeagueRulesState) {
  const json = JSON.stringify({rawTeam, leagueRules});
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readSharedState(): SharedPagePayload {
  const code = new URLSearchParams(window.location.search).get("team");
  if (!code) return {};
  try {
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(code.length / 4) * 4, "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as SharedPagePayload;
    return {rawTeam: parsed.rawTeam ?? "", leagueRules: parsed.leagueRules};
  } catch {
    return {};
  }
}

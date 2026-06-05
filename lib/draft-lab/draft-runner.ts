import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {createArenaVariant} from "@/lib/battle-ai/arena/variant";
import {runArenaGame} from "@/lib/battle-ai/arena/battle-runner";
import {createRng} from "@/lib/boss-generator/random";
import {completeDraftRosterBlock} from "@/lib/draft-lab/draft-sets";
import {applyLeagueRules} from "@/lib/rules/league-rules";
import {packUserTeam} from "@/lib/showdown/team";
import {parseTeam} from "@/lib/team-parser/parser";
import type {ArenaSerializableVariant, ArenaTeam} from "@/lib/battle-ai/arena/types";
import type {LeagueRules, SupportedFormat} from "@/lib/types";

const DEFAULT_FORMAT: SupportedFormat = "gen9ou";
const DEFAULT_VARIANT: ArenaSerializableVariant = {
  id: "draft-minimax",
  kind: "minimax",
  minimaxConfig: {depth: 2, nodeBudget: 30, timeBudgetMs: 80, maxLegalChoices: 4}
};

export interface DraftRosterMember {
  slot: number;
  species: string;
  rawBlock: string;
}

export interface DraftSideInput {
  name: string;
  rawRoster: string;
  fixedBring?: string[];
  fixedLead?: string;
  selectedMegaSpecies?: string;
}

export interface DraftTestOptions {
  seed: string;
  runs: number;
  maxTurns: number;
  format?: SupportedFormat;
  leagueRules?: Omit<LeagueRules, "selectedMegaSpecies">;
  variant?: ArenaSerializableVariant;
}

export interface DraftTestInput {
  you: DraftSideInput;
  opponent: DraftSideInput;
  options: DraftTestOptions;
}

export interface DraftBattleRun {
  id: string;
  seed: string;
  winner: "you" | "opponent" | "tie";
  turns: number;
  errors: string[];
  yourBring: string[];
  opponentBring: string[];
  yourLead: string;
  opponentLead: string;
  remaining: {
    you: number;
    opponent: number;
  };
  hpFraction: {
    you: number;
    opponent: number;
  };
}

export interface DraftRecord {
  label: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
}

export interface DraftTestReport {
  seed: string;
  createdAt: string;
  options: {
    runs: number;
    maxTurns: number;
    format: SupportedFormat;
    policy: string;
  };
  rosters: {
    you: string[];
    opponent: string[];
  };
  summary: {
    games: number;
    yourWins: number;
    opponentWins: number;
    ties: number;
    errors: number;
    yourWinRate: number;
    averageTurns: number;
  };
  records: {
    yourLeads: DraftRecord[];
    opponentLeads: DraftRecord[];
    yourBring: DraftRecord[];
    opponentBring: DraftRecord[];
  };
  runs: DraftBattleRun[];
}

interface PreparedSide {
  name: string;
  roster: DraftRosterMember[];
}

interface BattleSideSelection {
  members: DraftRosterMember[];
  lead: DraftRosterMember;
  team: ArenaTeam;
}

export function parseDraftRoster(rawRoster: string): DraftRosterMember[] {
  const cleaned = rawRoster.replace(/\r\n/g, "\n").trim();
  const blocks = isSpeciesList(cleaned)
    ? parseSpeciesList(cleaned)
    : cleaned
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

  if (!blocks.length) throw new Error("Draft roster must contain at least one Pokemon.");

  return blocks.map((block, index) => ({
    slot: index + 1,
    species: speciesFromBlock(block),
    rawBlock: block
  }));
}

export function runDraftTest(input: DraftTestInput): DraftTestReport {
  const options = normalizeOptions(input.options);
  const you = prepareSide(input.you);
  const opponent = prepareSide(input.opponent);
  const variant = createArenaVariant(options.variant);
  const runs: DraftBattleRun[] = [];

  for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
    const runSeed = `${options.seed}:run:${runIndex + 1}`;
    const yourSelection = buildSideSelection(you, input.you, options, runSeed, runIndex);
    const opponentSelection = buildSideSelection(opponent, input.opponent, options, runSeed, runIndex);
    const result = runArenaGame({
      id: `draft:${runIndex + 1}`,
      seed: runSeed,
      p1: {agent: "agentA", variant, team: yourSelection.team},
      p2: {agent: "agentB", variant, team: opponentSelection.team},
      maxTurns: options.maxTurns
    });

    runs.push({
      id: result.id,
      seed: runSeed,
      winner: result.winner === "agentA" ? "you" : result.winner === "agentB" ? "opponent" : "tie",
      turns: result.turns,
      errors: result.errors,
      yourBring: yourSelection.members.map((member) => member.species),
      opponentBring: opponentSelection.members.map((member) => member.species),
      yourLead: yourSelection.lead.species,
      opponentLead: opponentSelection.lead.species,
      remaining: {
        you: result.final.agentA.remainingPokemon,
        opponent: result.final.agentB.remainingPokemon
      },
      hpFraction: {
        you: round(result.final.agentA.hpFraction),
        opponent: round(result.final.agentB.hpFraction)
      }
    });
  }

  return createReport(options, you, opponent, runs);
}

export function writeDraftReport(report: DraftTestReport, runType = "draft-test"): string {
  const dir = path.join(process.cwd(), ".arena-runs");
  mkdirSync(dir, {recursive: true});
  const timestamp = report.createdAt.replace(/[:.]/g, "-");
  const filePath = path.join(dir, `${timestamp}-${runType}-${safeId(report.seed)}.json`);
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}

function normalizeOptions(options: DraftTestOptions): Required<Pick<DraftTestOptions, "seed" | "runs" | "maxTurns" | "format" | "variant">> &
  Pick<DraftTestOptions, "leagueRules"> {
  return {
    seed: options.seed.trim() || "draft-demo",
    runs: Math.max(1, Math.trunc(options.runs || 1)),
    maxTurns: Math.max(1, Math.trunc(options.maxTurns || 80)),
    format: options.format ?? DEFAULT_FORMAT,
    leagueRules: options.leagueRules,
    variant: options.variant ?? DEFAULT_VARIANT
  };
}

function prepareSide(input: DraftSideInput): PreparedSide {
  const roster = parseDraftRoster(input.rawRoster);
  if (roster.length < 1) throw new Error(`${input.name} roster is empty.`);
  return {name: input.name, roster};
}

function buildSideSelection(
  prepared: PreparedSide,
  input: DraftSideInput,
  options: ReturnType<typeof normalizeOptions>,
  seed: string,
  runIndex: number
): BattleSideSelection {
  const members = input.fixedBring?.length
    ? resolveFixedMembers(prepared.roster, input.fixedBring, `${prepared.name} bring`)
    : sampleBringMembers(prepared.roster, `${seed}:${prepared.name}:bring`);

  const lead = input.fixedLead ? resolveMember(members, input.fixedLead, `${prepared.name} lead`) : members[runIndex % members.length] ?? members[0];
  const ordered = moveLeadFirst(members, lead);
  const team = packDraftTeam({
    id: `${safeId(prepared.name)}-${runIndex + 1}`,
    name: prepared.name,
    sourcePath: "draft-lab",
    members: ordered,
    format: options.format,
    leagueRules: options.leagueRules
      ? {
          ...options.leagueRules,
          selectedMegaSpecies: input.selectedMegaSpecies
        }
      : undefined
  });
  return {members: ordered, lead, team};
}

function resolveFixedMembers(roster: DraftRosterMember[], selectors: string[], label: string): DraftRosterMember[] {
  const members = selectors.map((selector) => resolveMember(roster, selector, label));
  const unique = uniqueMembers(members);
  if (unique.length !== members.length) throw new Error(`${label} contains duplicate Pokemon.`);
  if (unique.length > 6) throw new Error(`${label} must contain at most six Pokemon.`);
  return unique;
}

function resolveMember(roster: DraftRosterMember[], selector: string, label: string): DraftRosterMember {
  const trimmed = selector.trim();
  const bySlot = trimmed.match(/^\d+$/) ? roster.find((member) => member.slot === Number(trimmed)) : undefined;
  const bySpecies = roster.find((member) => toId(member.species) === toId(trimmed));
  const member = bySlot ?? bySpecies;
  if (!member) throw new Error(`Could not find ${label} selector "${selector}".`);
  return member;
}

function sampleBringMembers(roster: DraftRosterMember[], seed: string): DraftRosterMember[] {
  if (roster.length <= 6) return roster.slice();
  const shuffled = shuffle(roster, seed);
  return shuffled.slice(0, 6).sort((left, right) => left.slot - right.slot);
}

function packDraftTeam({
  id,
  name,
  sourcePath,
  members,
  format,
  leagueRules
}: {
  id: string;
  name: string;
  sourcePath: string;
  members: DraftRosterMember[];
  format: SupportedFormat;
  leagueRules?: LeagueRules;
}): ArenaTeam {
  const rawTeam = members
    .map((member) => completeDraftRosterBlock(member.rawBlock, format, `${id}:${member.slot}`).rawBlock)
    .join("\n\n");
  const parsed = parseTeam(rawTeam, format);
  if (!parsed.team) throw new Error(`Could not parse ${name} team: ${parsed.issues.map((issue) => issue.message).join(" ")}`);

  const resolved = applyLeagueRules(parsed.team, leagueRules);
  const ruleErrors = resolved.issues.filter((issue) => issue.severity === "error");
  if (ruleErrors.length) throw new Error(`Invalid ${name} league rules: ${ruleErrors.map((issue) => issue.message).join(" ")}`);

  const packed = packUserTeam(resolved.team);
  if (packed.problems.length) {
    throw new Error(`Invalid ${name} team:\n${packed.problems.map((problem) => `- ${problem}`).join("\n")}`);
  }

  return {
    id,
    name,
    sourcePath,
    packed: packed.packed
  };
}

function createReport(options: ReturnType<typeof normalizeOptions>, you: PreparedSide, opponent: PreparedSide, runs: DraftBattleRun[]): DraftTestReport {
  const games = runs.length;
  const yourWins = runs.filter((run) => run.winner === "you").length;
  const opponentWins = runs.filter((run) => run.winner === "opponent").length;
  const ties = runs.filter((run) => run.winner === "tie").length;
  const errors = runs.filter((run) => run.errors.length > 0).length;
  const averageTurns = games ? runs.reduce((total, run) => total + run.turns, 0) / games : 0;

  return {
    seed: options.seed,
    createdAt: new Date().toISOString(),
    options: {
      runs: options.runs,
      maxTurns: options.maxTurns,
      format: options.format,
      policy: options.variant.id
    },
    rosters: {
      you: you.roster.map((member) => member.species),
      opponent: opponent.roster.map((member) => member.species)
    },
    summary: {
      games,
      yourWins,
      opponentWins,
      ties,
      errors,
      yourWinRate: games ? round(yourWins / games) : 0,
      averageTurns: round(averageTurns)
    },
    records: {
      yourLeads: recordsFor(runs, (run) => run.yourLead, "you"),
      opponentLeads: recordsFor(runs, (run) => run.opponentLead, "opponent"),
      yourBring: recordsFor(runs, (run) => run.yourBring.join(" / "), "you"),
      opponentBring: recordsFor(runs, (run) => run.opponentBring.join(" / "), "opponent")
    },
    runs
  };
}

function recordsFor(runs: DraftBattleRun[], labelFor: (run: DraftBattleRun) => string, perspective: "you" | "opponent"): DraftRecord[] {
  const rows = new Map<string, DraftRecord>();
  for (const run of runs) {
    const label = labelFor(run);
    const row = rows.get(label) ?? {label, games: 0, wins: 0, losses: 0, ties: 0, winRate: 0};
    row.games += 1;
    if (run.winner === "tie") row.ties += 1;
    else if (run.winner === perspective) row.wins += 1;
    else row.losses += 1;
    row.winRate = round(row.wins / row.games);
    rows.set(label, row);
  }
  return Array.from(rows.values()).sort((left, right) => right.winRate - left.winRate || right.games - left.games || left.label.localeCompare(right.label));
}

function moveLeadFirst(members: DraftRosterMember[], lead: DraftRosterMember): DraftRosterMember[] {
  return [lead, ...members.filter((member) => member.slot !== lead.slot)];
}

function uniqueMembers(members: DraftRosterMember[]): DraftRosterMember[] {
  const seen = new Set<number>();
  return members.filter((member) => {
    if (seen.has(member.slot)) return false;
    seen.add(member.slot);
    return true;
  });
}

function shuffle<T>(values: T[], seed: string): T[] {
  const rng = createRng(seed);
  const shuffled = values.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function speciesFromBlock(block: string): string {
  const header = block.split("\n")[0] ?? "";
  const [identityPart] = header.split("@").map((part) => part.trim());
  const parentheticalSpecies = identityPart.match(/^(.*?)\s*\((.*?)\)$/);
  return parentheticalSpecies?.[2]?.trim() || identityPart.trim() || "Unknown";
}

function isSpeciesList(cleaned: string): boolean {
  if (!cleaned) return false;
  const lines = cleaned.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  if (!lines.length) return false;
  return lines.every((line) => !line.startsWith("- ") && !line.includes(":") && !line.includes("@"));
}

function parseSpeciesList(cleaned: string): string[] {
  return cleaned
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith("#"));
}

function safeId(value: string): string {
  return toId(value) || "draft";
}

function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

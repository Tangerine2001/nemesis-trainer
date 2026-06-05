import {readFileSync} from "node:fs";
import {runDraftTest, writeDraftReport} from "@/lib/draft-lab/draft-runner";
import type {LeagueRules} from "@/lib/types";

const args = parseArgs(process.argv.slice(2));

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function main(): void {
  const youPath = requiredArg("you");
  const opponentPath = requiredArg("opp");
  const seed = String(args.seed ?? "draft-demo");
  const runs = numberArg(args.runs, 20);
  const maxTurns = numberArg(args.maxTurns, 80);
  const leagueRules = draftMegaRules();

  const report = runDraftTest({
    you: {
      name: "You",
      rawRoster: readFileSync(youPath, "utf8"),
      fixedBring: listArg(args.yourBring),
      fixedLead: stringArg(args.yourLead),
      selectedMegaSpecies: stringArg(args.yourMega)
    },
    opponent: {
      name: "Opponent",
      rawRoster: readFileSync(opponentPath, "utf8"),
      fixedBring: listArg(args.oppBring),
      fixedLead: stringArg(args.oppLead),
      selectedMegaSpecies: stringArg(args.oppMega)
    },
    options: {
      seed,
      runs,
      maxTurns,
      leagueRules
    }
  });

  const reportPath = writeDraftReport(report);
  console.log(`Draft test complete: ${report.summary.games} games`);
  console.log(`You: ${report.summary.yourWins}-${report.summary.opponentWins}-${report.summary.ties} (${Math.round(report.summary.yourWinRate * 100)}% win rate)`);
  console.log(`Average turns: ${report.summary.averageTurns}`);
  console.log(`Report: ${reportPath}`);
  console.log("\nYour lead records:");
  console.table(report.records.yourLeads.slice(0, 8));
  console.log("Opponent lead records:");
  console.table(report.records.opponentLeads.slice(0, 8));
}

function draftMegaRules(): LeagueRules | undefined {
  const megaStonesPath = stringArg(args.megaStones);
  const megaStoneBySpecies = megaStonesPath ? parseMegaStoneFile(readFileSync(megaStonesPath, "utf8")) : {};
  const enabled = args.draftMega === "true" || Object.keys(megaStoneBySpecies).length > 0 || Boolean(args.yourMega || args.oppMega);
  if (!enabled) return undefined;
  return {
    megaMode: "draft-forced-stones",
    maxMegaEvolutionsPerBattle: 1,
    megaStoneBySpecies,
    inferMegaStoneNames: true
  };
}

function parseMegaStoneFile(raw: string): Record<string, string> {
  const mappings: Record<string, string> = {};
  raw.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) throw new Error(`Mega Stone mapping line ${index + 1} must use "Species = Stone".`);
    const species = trimmed.slice(0, separatorIndex).trim();
    const item = trimmed.slice(separatorIndex + 1).trim();
    if (!species || !item) throw new Error(`Mega Stone mapping line ${index + 1} is missing a species or stone.`);
    mappings[species] = item;
  });
  return mappings;
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1]?.startsWith("--") ? undefined : argv[index + 1];
    parsed[key] = value ?? "true";
    if (value) index += 1;
  }
  return parsed;
}

function requiredArg(key: string): string {
  const value = stringArg(args[key]);
  if (!value) throw new Error(`Missing required --${key} path.`);
  return value;
}

function stringArg(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function listArg(value: string | undefined): string[] | undefined {
  const values = value?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];
  return values.length ? values : undefined;
}

function numberArg(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

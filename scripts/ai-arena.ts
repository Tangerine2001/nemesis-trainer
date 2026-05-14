import {loadArenaTeams} from "@/lib/battle-ai/arena/team-pool";
import {defaultArenaVariants} from "@/lib/battle-ai/arena/variant";
import {createArenaReport, createArenaTasks, writeArenaReport} from "@/lib/battle-ai/arena/report";
import {resolveWorkerCount, runMatchTasks} from "@/lib/battle-ai/arena/worker-pool";

const args = parseArgs(process.argv.slice(2));
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const seed = String(args.seed ?? "arena-demo");
  const rounds = numberArg(args.rounds, 4);
  const maxPairs = numberArg(args.maxPairs, 5);
  const maxTurns = numberArg(args.maxTurns, 120);
  const teams = loadArenaTeams();
  const variants = defaultArenaVariants();
  const tasks = createArenaTasks({seed, rounds, variants, maxPairs, maxTurns});
  const workers = resolveWorkerCount(args.workers, tasks.length);
  const matches = await runMatchTasks(tasks, teams, workers);
  const report = createArenaReport({seed, options: {rounds, maxPairs, maxTurns, workers}, teams, variants, matches});
  const path = writeArenaReport(report, "arena", seed);

  console.log(`AI arena complete: ${matches.length} matches, ${workers} worker(s)`);
  console.log(`Report: ${path}`);
  console.table(report.standings);
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

function numberArg(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

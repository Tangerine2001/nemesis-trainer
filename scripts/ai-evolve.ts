import {loadArenaTeams} from "@/lib/battle-ai/arena/team-pool";
import {writeArenaReport} from "@/lib/battle-ai/arena/report";
import {resolveWorkerCount} from "@/lib/battle-ai/arena/worker-pool";
import {runEvolution} from "@/lib/battle-ai/evolution/evolve";

const args = parseArgs(process.argv.slice(2));
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const seed = String(args.seed ?? "evolve-demo");
  const generations = numberArg(args.generations, 5);
  const population = numberArg(args.population, 8);
  const rounds = numberArg(args.rounds, 2);
  const maxPairs = numberArg(args.maxPairs, 5);
  const maxTurns = numberArg(args.maxTurns, 120);
  const teams = loadArenaTeams();
  const estimatedTasks = Math.max(1, generations * rounds * ((population * (population - 1)) / 2));
  const workers = resolveWorkerCount(args.workers, estimatedTasks);

  const report = await runEvolution(teams, {seed, generations, population, rounds, workers, maxPairs, maxTurns});
  const path = writeArenaReport(report, "evolve", seed);

  console.log(`AI evolution complete: ${generations} generation(s), population ${population}, ${workers} worker(s)`);
  console.log(`Champion: ${report.champion.id} fitness=${report.champion.fitness.toFixed(2)}`);
  console.log(`Report: ${path}`);
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

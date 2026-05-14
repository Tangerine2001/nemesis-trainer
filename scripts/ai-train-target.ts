import {loadArenaTeams} from "@/lib/battle-ai/arena/team-pool";
import {writeArenaReport} from "@/lib/battle-ai/arena/report";
import {resolveWorkerCount} from "@/lib/battle-ai/arena/worker-pool";
import {runTargetTraining} from "@/lib/battle-ai/evolution/target-training";

const args = parseArgs(process.argv.slice(2));
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const seed = String(args.seed ?? "target-v1");
  const generations = numberArg(args.generations, 20);
  const population = numberArg(args.population, 24);
  const trainChallenges = numberArg(args.trainChallenges, 10);
  const holdoutChallenges = numberArg(args.holdoutChallenges, 10);
  const targetWins = numberArg(args.targetWins, 8);
  const maxTurns = numberArg(args.maxTurns, 120);
  const mutationRate = numberArg(args.mutationRate, 0.18);
  const elitism = numberArg(args.elitism, 3);
  const tournamentSize = numberArg(args.tournamentSize, 3);
  const teams = loadArenaTeams();
  const estimatedTasks = Math.max(1, generations * population * trainChallenges + holdoutChallenges);
  const workers = resolveWorkerCount(args.workers, estimatedTasks);
  const startedAt = Date.now();

  const report = await runTargetTraining(teams, {
    seed,
    generations,
    population,
    mutationRate,
    elitism,
    tournamentSize,
    workers,
    maxTurns,
    trainChallenges,
    holdoutChallenges,
    targetWins,
    onGeneration(generation) {
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `Generation ${generation.generation + 1}/${generations}: champion ${generation.champion.id} fitness=${generation.champion.fitness.toFixed(
          2
        )} elapsed=${elapsedSeconds}s`
      );
    }
  });
  const path = writeArenaReport(report, "target-training", seed);

  console.log(`Target training complete: ${generations} generation(s), population ${population}, ${workers} worker(s)`);
  console.log(`Champion: ${report.champion.id} fitness=${report.champion.fitness.toFixed(2)}`);
  console.log(`Holdout: ${report.holdout.candidateWins}/${holdoutChallenges} double-side wins ${report.holdout.pass ? "PASS" : "FAIL"}`);
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

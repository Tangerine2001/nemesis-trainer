import {DEFAULT_MINIMAX_CONFIG} from "@/lib/battle-ai/minimax-policy";
import {runMatchTasks} from "@/lib/battle-ai/arena/worker-pool";
import {
  DEFAULT_EVOLUTION_CONFIG,
  crossoverGenomes,
  initialPopulation,
  mutateGenome,
  selectParent
} from "@/lib/battle-ai/evolution/genome";
import type {ArenaMatchResultSummary, ArenaMatchTask, ArenaSerializableVariant, ArenaTeam} from "@/lib/battle-ai/arena/types";
import type {EvolutionConfig, HeuristicGenome} from "@/lib/battle-ai/evolution/genome";

export interface TargetTrainingRunOptions extends Partial<EvolutionConfig> {
  seed: string;
  workers: number;
  maxTurns: number;
  trainChallenges: number;
  holdoutChallenges: number;
  targetWins: number;
  onGeneration?: (report: TargetTrainingGenerationReport) => void;
}

export interface TargetTrainingGenerationReport {
  generation: number;
  genomes: Array<{id: string; fitness: number; weights: HeuristicGenome["weights"]}>;
  champion: {id: string; fitness: number; weights: HeuristicGenome["weights"]};
  matches: ArenaMatchResultSummary[];
}

export interface TargetTrainingHoldoutResult {
  candidateWins: number;
  benchmarkWins: number;
  sharedTies: number;
  pass: boolean;
  matches: ArenaMatchResultSummary[];
}

export interface TargetTrainingRunReport {
  seed: string;
  createdAt: string;
  options: Omit<TargetTrainingRunOptions, "onGeneration"> & EvolutionConfig;
  benchmark: ArenaSerializableVariant;
  generations: TargetTrainingGenerationReport[];
  champion: {id: string; fitness: number; weights: HeuristicGenome["weights"]};
  holdout: TargetTrainingHoldoutResult;
}

const BENCHMARK_VARIANT: ArenaSerializableVariant = {
  id: "minimax-default",
  kind: "minimax",
  minimaxConfig: DEFAULT_MINIMAX_CONFIG
};

export async function runTargetTraining(teams: ArenaTeam[], options: TargetTrainingRunOptions): Promise<TargetTrainingRunReport> {
  const config: EvolutionConfig = {...DEFAULT_EVOLUTION_CONFIG, elitism: 3, ...options};
  let population = initialPopulation(options.seed, config.population);
  const generations: TargetTrainingGenerationReport[] = [];

  for (let generation = 0; generation < config.generations; generation += 1) {
    const matches = await runMatchTasks(
      createTargetMatchTasks({
        seed: `${options.seed}:generation-${generation}`,
        genomes: population,
        challenges: options.trainChallenges,
        maxTurns: options.maxTurns
      }),
      teams,
      options.workers
    );
    const scored = scoreTargetPopulation(population, matches).sort((left, right) => right.fitness - left.fitness || left.genome.id.localeCompare(right.genome.id));
    const champion = scored[0];

    generations.push({
      generation,
      genomes: scored.map((entry) => ({id: entry.genome.id, fitness: entry.fitness, weights: entry.genome.weights})),
      champion: {id: champion.genome.id, fitness: champion.fitness, weights: champion.genome.weights},
      matches
    });
    options.onGeneration?.(generations[generations.length - 1]);

    population = nextTargetPopulation(scored, config, `${options.seed}:generation-${generation}`);
  }

  const champion = generations[generations.length - 1].champion;
  const holdoutMatches = await runMatchTasks(
    createTargetMatchTasks({
      seed: `${options.seed}:holdout`,
      genomes: [{id: champion.id, weights: champion.weights}],
      challenges: options.holdoutChallenges,
      maxTurns: options.maxTurns
    }),
    teams,
    options.workers
  );

  return {
    seed: options.seed,
    createdAt: new Date().toISOString(),
    options: reportOptions(config, options),
    benchmark: BENCHMARK_VARIANT,
    generations,
    champion,
    holdout: summarizeHoldout(holdoutMatches, options.targetWins)
  };
}

function reportOptions(
  config: EvolutionConfig,
  options: TargetTrainingRunOptions
): Omit<TargetTrainingRunOptions, "onGeneration"> & EvolutionConfig {
  const {onGeneration: _onGeneration, ...serializableOptions} = options;
  return {...config, ...serializableOptions};
}

export function createTargetMatchTasks({
  seed,
  genomes,
  challenges,
  maxTurns
}: {
  seed: string;
  genomes: HeuristicGenome[];
  challenges: number;
  maxTurns: number;
}): ArenaMatchTask[] {
  const tasks: ArenaMatchTask[] = [];
  for (const genome of genomes) {
    const candidate = genomeToTargetVariant(genome);
    for (let challenge = 0; challenge < challenges; challenge += 1) {
      tasks.push({
        id: `${genome.id}:target-challenge-${challenge}`,
        seed: `${seed}:${genome.id}:target-challenge-${challenge}`,
        agentA: candidate,
        agentB: BENCHMARK_VARIANT,
        maxPairs: 1,
        maxTurns
      });
    }
  }
  return tasks;
}

export function summarizeHoldout(matches: ArenaMatchResultSummary[], targetWins: number): TargetTrainingHoldoutResult {
  const candidateWins = countCandidateDoubleSideWins(matches);
  const benchmarkWins = matches.filter((match) => match.result === "agentB").length;
  const sharedTies = matches.filter((match) => match.result === "shared-win-tie").length;
  return {
    candidateWins,
    benchmarkWins,
    sharedTies,
    pass: candidateWins >= targetWins,
    matches
  };
}

export function countCandidateDoubleSideWins(matches: ArenaMatchResultSummary[]): number {
  return matches.filter((match) => match.result === "agentA").length;
}

function genomeToTargetVariant(genome: HeuristicGenome): ArenaSerializableVariant {
  return {
    id: genome.id,
    kind: "minimax",
    weights: genome.weights,
    minimaxConfig: DEFAULT_MINIMAX_CONFIG
  };
}

function scoreTargetPopulation(population: HeuristicGenome[], matches: ArenaMatchResultSummary[]): Array<{genome: HeuristicGenome; fitness: number}> {
  return population.map((genome) => {
    const genomeMatches = matches.filter((match) => match.agentA.id === genome.id);
    return {
      genome,
      fitness: genomeMatches.reduce((total, match) => total + scoreTargetMatch(match), 0)
    };
  });
}

function scoreTargetMatch(match: ArenaMatchResultSummary): number {
  const resultScore = match.result === "agentA" ? 2_000 : match.result === "agentB" ? -1_800 : -500;
  const qualityDelta = match.fitness.agentA - match.fitness.agentB;
  const errors = match.pairs.reduce(
    (total, pair) => total + pair.games.reduce((gameTotal, game) => gameTotal + game.errors.length + game.fallbackChoices * 0.1, 0),
    0
  );
  return resultScore + qualityDelta - errors * 120;
}

function nextTargetPopulation(scored: Array<{genome: HeuristicGenome; fitness: number}>, config: EvolutionConfig, seed: string): HeuristicGenome[] {
  const next = scored.slice(0, config.elitism).map((entry, index) => ({id: `elite-${index}-${entry.genome.id}`, weights: entry.genome.weights}));
  while (next.length < config.population) {
    const childIndex = next.length;
    const left = selectParent(scored, `${seed}:parent-left:${childIndex}`, config.tournamentSize);
    const right = selectParent(scored, `${seed}:parent-right:${childIndex}`, config.tournamentSize);
    const crossed = crossoverGenomes(left, right, `${seed}:crossover:${childIndex}`, `target-${seed.split(":").at(-1)}-${childIndex}`);
    next.push(mutateGenome(crossed, `${seed}:mutation:${childIndex}`, config.mutationRate, crossed.id));
  }
  return next;
}

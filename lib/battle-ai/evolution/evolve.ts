import {runMatchTasks} from "@/lib/battle-ai/arena/worker-pool";
import {createArenaTasks} from "@/lib/battle-ai/arena/report";
import {
  DEFAULT_EVOLUTION_CONFIG,
  crossoverGenomes,
  initialPopulation,
  mutateGenome,
  selectParent
} from "@/lib/battle-ai/evolution/genome";
import type {ArenaMatchResultSummary, ArenaSerializableVariant, ArenaTeam} from "@/lib/battle-ai/arena/types";
import type {EvolutionConfig, HeuristicGenome} from "@/lib/battle-ai/evolution/genome";

export interface EvolutionRunOptions extends Partial<EvolutionConfig> {
  seed: string;
  rounds: number;
  workers: number;
  maxPairs: number;
  maxTurns: number;
}

export interface EvolutionGenerationReport {
  generation: number;
  genomes: Array<{id: string; fitness: number; weights: HeuristicGenome["weights"]}>;
  champion: {id: string; fitness: number; weights: HeuristicGenome["weights"]};
  matches: ArenaMatchResultSummary[];
}

export interface EvolutionRunReport {
  seed: string;
  createdAt: string;
  options: EvolutionRunOptions & EvolutionConfig;
  generations: EvolutionGenerationReport[];
  champion: {id: string; fitness: number; weights: HeuristicGenome["weights"]};
}

export async function runEvolution(teams: ArenaTeam[], options: EvolutionRunOptions): Promise<EvolutionRunReport> {
  const config: EvolutionConfig = {...DEFAULT_EVOLUTION_CONFIG, ...options};
  let population = initialPopulation(options.seed, config.population);
  const generations: EvolutionGenerationReport[] = [];

  for (let generation = 0; generation < config.generations; generation += 1) {
    const variants = population.map(genomeToVariant);
    const tasks = createArenaTasks({
      seed: `${options.seed}:generation-${generation}`,
      rounds: options.rounds,
      variants,
      maxPairs: options.maxPairs,
      maxTurns: options.maxTurns
    });
    const matches = await runMatchTasks(tasks, teams, options.workers);
    const scored = scorePopulation(population, matches).sort((left, right) => right.fitness - left.fitness || left.genome.id.localeCompare(right.genome.id));
    const champion = scored[0];

    generations.push({
      generation,
      genomes: scored.map((entry) => ({id: entry.genome.id, fitness: entry.fitness, weights: entry.genome.weights})),
      champion: {id: champion.genome.id, fitness: champion.fitness, weights: champion.genome.weights},
      matches
    });

    population = nextPopulation(scored, config, `${options.seed}:generation-${generation}`);
  }

  const champion = generations[generations.length - 1].champion;
  return {
    seed: options.seed,
    createdAt: new Date().toISOString(),
    options: {...config, ...options},
    generations,
    champion
  };
}

function genomeToVariant(genome: HeuristicGenome): ArenaSerializableVariant {
  return {id: genome.id, kind: "minimax", weights: genome.weights};
}

function scorePopulation(population: HeuristicGenome[], matches: ArenaMatchResultSummary[]): Array<{genome: HeuristicGenome; fitness: number}> {
  const scores = new Map(population.map((genome) => [genome.id, 0]));
  for (const match of matches) {
    scores.set(match.agentA.id, (scores.get(match.agentA.id) ?? 0) + match.fitness.agentA);
    scores.set(match.agentB.id, (scores.get(match.agentB.id) ?? 0) + match.fitness.agentB);
  }
  return population.map((genome) => ({genome, fitness: scores.get(genome.id) ?? 0}));
}

function nextPopulation(scored: Array<{genome: HeuristicGenome; fitness: number}>, config: EvolutionConfig, seed: string): HeuristicGenome[] {
  const next = scored.slice(0, config.elitism).map((entry, index) => ({id: `elite-${index}-${entry.genome.id}`, weights: entry.genome.weights}));
  while (next.length < config.population) {
    const childIndex = next.length;
    const left = selectParent(scored, `${seed}:parent-left:${childIndex}`, config.tournamentSize);
    const right = selectParent(scored, `${seed}:parent-right:${childIndex}`, config.tournamentSize);
    const crossed = crossoverGenomes(left, right, `${seed}:crossover:${childIndex}`, `genome-${seed.split(":").at(-1)}-${childIndex}`);
    next.push(mutateGenome(crossed, `${seed}:mutation:${childIndex}`, config.mutationRate, crossed.id));
  }
  return next;
}

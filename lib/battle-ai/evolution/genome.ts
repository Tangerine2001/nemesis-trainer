import {createRng} from "@/lib/boss-generator/random";
import {
  DEFAULT_EVALUATION_WEIGHTS,
  EVALUATION_WEIGHT_BOUNDS,
  STATUS_WEIGHT_BOUNDS
} from "@/lib/battle-ai/evaluate";
import type {EvaluationWeights} from "@/lib/battle-ai/evaluate";

export interface HeuristicGenome {
  id: string;
  weights: EvaluationWeights;
}

export interface EvolutionConfig {
  population: number;
  generations: number;
  mutationRate: number;
  elitism: number;
  tournamentSize: number;
}

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  population: 8,
  generations: 5,
  mutationRate: 0.18,
  elitism: 2,
  tournamentSize: 3
};

export function initialPopulation(seed: string, size: number): HeuristicGenome[] {
  const population: HeuristicGenome[] = [{id: "genome-default", weights: cloneWeights(DEFAULT_EVALUATION_WEIGHTS)}];
  for (let index = 1; index < size; index += 1) {
    population.push(mutateGenome(population[0], `${seed}:initial:${index}`, 0.75, `genome-initial-${index}`));
  }
  return population;
}

export function mutateGenome(genome: HeuristicGenome, seed: string, mutationRate: number, id: string): HeuristicGenome {
  const rng = createRng(seed);
  const weights = cloneWeights(genome.weights);

  for (const key of Object.keys(EVALUATION_WEIGHT_BOUNDS) as Array<keyof typeof EVALUATION_WEIGHT_BOUNDS>) {
    if (rng() <= mutationRate) weights[key] = mutateNumber(weights[key], EVALUATION_WEIGHT_BOUNDS[key], rng);
  }

  for (const key of Object.keys(STATUS_WEIGHT_BOUNDS)) {
    if (rng() <= mutationRate) weights.status[key] = mutateNumber(weights.status[key], STATUS_WEIGHT_BOUNDS[key], rng);
  }

  return {id, weights};
}

export function crossoverGenomes(left: HeuristicGenome, right: HeuristicGenome, seed: string, id: string): HeuristicGenome {
  const rng = createRng(seed);
  const weights = cloneWeights(left.weights);
  for (const key of Object.keys(EVALUATION_WEIGHT_BOUNDS) as Array<keyof typeof EVALUATION_WEIGHT_BOUNDS>) {
    weights[key] = rng() < 0.5 ? left.weights[key] : right.weights[key];
  }
  for (const key of Object.keys(STATUS_WEIGHT_BOUNDS)) {
    weights.status[key] = rng() < 0.5 ? left.weights.status[key] : right.weights.status[key];
  }
  return {id, weights};
}

export function selectParent(scored: Array<{genome: HeuristicGenome; fitness: number}>, seed: string, tournamentSize: number): HeuristicGenome {
  const rng = createRng(seed);
  let best = scored[Math.floor(rng() * scored.length)] ?? scored[0];
  for (let index = 1; index < tournamentSize; index += 1) {
    const candidate = scored[Math.floor(rng() * scored.length)] ?? best;
    if (candidate.fitness > best.fitness) best = candidate;
  }
  return best.genome;
}

function mutateNumber(value: number, bounds: {min: number; max: number}, rng: () => number): number {
  const span = bounds.max - bounds.min;
  const delta = (rng() * 2 - 1) * span * 0.16;
  return roundWeight(Math.max(bounds.min, Math.min(bounds.max, value + delta)));
}

function cloneWeights(weights: EvaluationWeights): EvaluationWeights {
  return {
    alive: weights.alive,
    totalHp: weights.totalHp,
    activeHp: weights.activeHp,
    typePressure: weights.typePressure,
    speedPressure: weights.speedPressure,
    moveUtility: weights.moveUtility,
    itemAbility: weights.itemAbility,
    status: {...weights.status}
  };
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

import {DEFAULT_MINIMAX_CONFIG} from "@/lib/battle-ai/minimax-policy";
import {runMatchTasks} from "@/lib/battle-ai/arena/worker-pool";
import {createRng} from "@/lib/boss-generator/random";
import {
  DEFAULT_EVOLUTION_CONFIG,
  crossoverGenomes,
  initialPopulation,
  mutateGenome,
  selectParent
} from "@/lib/battle-ai/evolution/genome";
import type {ArenaAgentId, ArenaMatchResultSummary, ArenaMatchTask, ArenaSerializableVariant, ArenaTeam} from "@/lib/battle-ai/arena/types";
import type {EvolutionConfig, HeuristicGenome} from "@/lib/battle-ai/evolution/genome";

export interface TargetTrainingRunOptions extends Partial<EvolutionConfig> {
  seed: string;
  workers: number;
  maxTurns: number;
  trainChallenges: number;
  onGeneration?: (report: TargetTrainingGenerationReport) => void;
}

export interface TargetTrainingGenomeScore {
  id: string;
  fitness: number;
  weights: HeuristicGenome["weights"];
  matches: number;
  doubleSideWins: number;
  sharedTies: number;
  losses: number;
  gameWins: number;
  gameLosses: number;
  decisiveGameWins: number;
  splitPairs: number;
  maxTurnTies: number;
  matchWinRate: number;
  gameWinRate: number;
  qualityDelta: number;
  scoreBreakdown: TargetTrainingScoreBreakdown;
}

export interface TargetTrainingScoreBreakdown {
  doubleSideWinScore: number;
  gameWinScore: number;
  splitPairScore: number;
  tieScore: number;
  qualityScore: number;
  lossPenalty: number;
  maxTurnTiePenalty: number;
  total: number;
}

export interface TargetTrainingGenerationReport {
  generation: number;
  genomes: TargetTrainingGenomeScore[];
  champion: TargetTrainingGenomeScore;
  matches: ArenaMatchResultSummary[];
}

export interface TargetTrainingRunReport {
  seed: string;
  createdAt: string;
  trainingMode: "peer-play";
  options: Omit<TargetTrainingRunOptions, "onGeneration"> & EvolutionConfig;
  generations: TargetTrainingGenerationReport[];
  champion: TargetTrainingGenomeScore;
  bestSoFar: TargetTrainingGenomeScore;
}

export async function runTargetTraining(teams: ArenaTeam[], options: TargetTrainingRunOptions): Promise<TargetTrainingRunReport> {
  const config: EvolutionConfig = {...DEFAULT_EVOLUTION_CONFIG, elitism: 3, ...options};
  let population = initialPopulation(options.seed, config.population);
  const generations: TargetTrainingGenerationReport[] = [];
  let bestSoFar: TargetTrainingGenomeScore | undefined;

  for (let generation = 0; generation < config.generations; generation += 1) {
    const previousElites = generation > 0 ? population.slice(0, Math.min(config.elitism, population.length)) : [];
    const incumbent = previousElites[0];
    const eliteIds = new Set(previousElites.map((genome) => genome.id));
    const matches = await runMatchTasks(
      [
        ...createPeerTrainingMatchTasks({
          seed: `${options.seed}:generation-${generation}`,
          genomes: population,
          rounds: options.trainChallenges,
          maxTurns: options.maxTurns
        }),
        ...createIncumbentDefenseMatchTasks({
          seed: `${options.seed}:generation-${generation}:incumbent-defense`,
          incumbent,
          challengers: population.filter((genome) => genome.id !== incumbent?.id),
          maxTurns: options.maxTurns
        }),
        ...createEliteDefenseMatchTasks({
          seed: `${options.seed}:generation-${generation}:elite-defense`,
          elites: previousElites.slice(1),
          challengers: population.filter((genome) => !eliteIds.has(genome.id)),
          maxTurns: options.maxTurns
        })
      ],
      teams,
      options.workers
    );
    const scored = scorePeerPopulation(population, matches);
    const champion = scored[0];
    bestSoFar = selectBetterScore(bestSoFar, champion.score);

    generations.push({
      generation,
      genomes: scored.map((entry) => entry.score),
      champion: champion.score,
      matches
    });
    options.onGeneration?.(generations[generations.length - 1]);

    population = nextTargetPopulation(scored, config, `${options.seed}:generation-${generation}`);
  }

  const champion = generations[generations.length - 1].champion;
  return {
    seed: options.seed,
    createdAt: new Date().toISOString(),
    trainingMode: "peer-play",
    options: reportOptions(config, options),
    generations,
    champion,
    bestSoFar: bestSoFar ?? champion
  };
}

function reportOptions(
  config: EvolutionConfig,
  options: TargetTrainingRunOptions
): Omit<TargetTrainingRunOptions, "onGeneration"> & EvolutionConfig {
  const {onGeneration: _onGeneration, ...serializableOptions} = options;
  return {...config, ...serializableOptions};
}

export function createPeerTrainingMatchTasks({
  seed,
  genomes,
  rounds,
  maxTurns
}: {
  seed: string;
  genomes: HeuristicGenome[];
  rounds: number;
  maxTurns: number;
}): ArenaMatchTask[] {
  const tasks: ArenaMatchTask[] = [];
  if (genomes.length < 2) return tasks;

  for (let round = 0; round < rounds; round += 1) {
    const shuffled = seededShuffle(genomes, `${seed}:round-${round}`);
    for (let index = 0; index + 1 < shuffled.length; index += 2) {
      const left = shuffled[index];
      const right = shuffled[index + 1];
      const flip = (round + index / 2) % 2 === 1;
      const agentA = flip ? right : left;
      const agentB = flip ? left : right;
      tasks.push({
        id: `${seed}:round-${round}:match-${Math.floor(index / 2)}:${agentA.id}-vs-${agentB.id}`,
        seed: `${seed}:round-${round}:match-${Math.floor(index / 2)}:${agentA.id}:vs:${agentB.id}`,
        agentA: genomeToTargetVariant(agentA),
        agentB: genomeToTargetVariant(agentB),
        maxPairs: 1,
        maxTurns
      });
    }
  }

  return tasks;
}

export function createIncumbentDefenseMatchTasks({
  seed,
  incumbent,
  challengers,
  maxTurns
}: {
  seed: string;
  incumbent?: HeuristicGenome;
  challengers: HeuristicGenome[];
  maxTurns: number;
}): ArenaMatchTask[] {
  if (!incumbent) return [];
  return challengers.map((challenger, index) => {
    const flip = index % 2 === 1;
    const agentA = flip ? incumbent : challenger;
    const agentB = flip ? challenger : incumbent;
    return {
      id: `${seed}:match-${index}:${agentA.id}-vs-${agentB.id}`,
      seed: `${seed}:match-${index}:${agentA.id}:vs:${agentB.id}`,
      agentA: genomeToTargetVariant(agentA),
      agentB: genomeToTargetVariant(agentB),
      maxPairs: 1,
      maxTurns
    };
  });
}

export function createEliteDefenseMatchTasks({
  seed,
  elites,
  challengers,
  maxTurns,
  maxMatches = challengers.length
}: {
  seed: string;
  elites: HeuristicGenome[];
  challengers: HeuristicGenome[];
  maxTurns: number;
  maxMatches?: number;
}): ArenaMatchTask[] {
  if (!elites.length || !challengers.length || maxMatches <= 0) return [];
  return challengers.slice(0, maxMatches).map((challenger, index) => {
    const elite = elites[index % elites.length];
    const flip = index % 2 === 1;
    const agentA = flip ? elite : challenger;
    const agentB = flip ? challenger : elite;
    return {
      id: `${seed}:match-${index}:${agentA.id}-vs-${agentB.id}`,
      seed: `${seed}:match-${index}:${agentA.id}:vs:${agentB.id}`,
      agentA: genomeToTargetVariant(agentA),
      agentB: genomeToTargetVariant(agentB),
      maxPairs: 1,
      maxTurns
    };
  });
}

// Backwards-compatible export for older tests/scripts. These are now peer-play tasks.
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
  return createPeerTrainingMatchTasks({seed, genomes, rounds: challenges, maxTurns});
}

export function scorePeerPopulation(
  population: HeuristicGenome[],
  matches: ArenaMatchResultSummary[]
): Array<{genome: HeuristicGenome; score: TargetTrainingGenomeScore}> {
  return population
    .map((genome) => ({
      genome,
      score: scorePeerGenome(genome, matches)
    }))
    .sort((left, right) => right.score.fitness - left.score.fitness || left.genome.id.localeCompare(right.genome.id));
}

function scorePeerGenome(genome: HeuristicGenome, matches: ArenaMatchResultSummary[]): TargetTrainingGenomeScore {
  const score: TargetTrainingGenomeScore = {
    id: genome.id,
    fitness: 0,
    weights: genome.weights,
    matches: 0,
    doubleSideWins: 0,
    sharedTies: 0,
    losses: 0,
    gameWins: 0,
    gameLosses: 0,
    decisiveGameWins: 0,
    splitPairs: 0,
    maxTurnTies: 0,
    matchWinRate: 0,
    gameWinRate: 0,
    qualityDelta: 0,
    scoreBreakdown: emptyScoreBreakdown()
  };

  for (const match of matches) {
    const side = sideForGenome(match, genome.id);
    if (!side) continue;

    const opposingSide = oppositeAgent(side);
    score.matches += 1;
    if (match.result === side) score.doubleSideWins += 1;
    else if (match.result === "shared-win-tie") score.sharedTies += 1;
    else score.losses += 1;

    score.qualityDelta += match.fitness[side] - match.fitness[opposingSide];
    for (const pair of match.pairs) {
      let sideGameWins = 0;
      let opposingGameWins = 0;
      for (const game of pair.games) {
        if (game.winner === side) {
          score.gameWins += 1;
          score.decisiveGameWins += 1;
          sideGameWins += 1;
        } else if (game.winner === opposingSide) {
          score.gameLosses += 1;
          opposingGameWins += 1;
        } else if (isMaxTurnTie(game)) {
          score.maxTurnTies += 1;
        }
      }
      if (sideGameWins > 0 && opposingGameWins > 0) score.splitPairs += 1;
    }
  }

  const totalGames = score.gameWins + score.gameLosses;
  score.matchWinRate = score.matches ? round(score.doubleSideWins / score.matches) : 0;
  score.gameWinRate = totalGames ? round(score.gameWins / totalGames) : 0;
  score.scoreBreakdown = peerFitnessBreakdown(score);
  score.fitness = score.scoreBreakdown.total;
  return score;
}

function peerFitnessBreakdown(score: TargetTrainingGenomeScore): TargetTrainingScoreBreakdown {
  const doubleSideWinScore = score.doubleSideWins * 3_000 + score.matchWinRate * 1_500;
  const gameWinScore = score.decisiveGameWins * 220 + score.gameWinRate * 800;
  const splitPairScore = score.splitPairs * 320;
  const tieScore = score.sharedTies * 120;
  const qualityScore = score.qualityDelta * 0.35;
  const lossPenalty = score.losses * 1_500 + score.gameLosses * 130;
  const maxTurnTiePenalty = score.maxTurnTies * 80;
  return {
    doubleSideWinScore: round(doubleSideWinScore),
    gameWinScore: round(gameWinScore),
    splitPairScore: round(splitPairScore),
    tieScore: round(tieScore),
    qualityScore: round(qualityScore),
    lossPenalty: round(lossPenalty),
    maxTurnTiePenalty: round(maxTurnTiePenalty),
    total: round(doubleSideWinScore + gameWinScore + splitPairScore + tieScore + qualityScore - lossPenalty - maxTurnTiePenalty)
  };
}

function genomeToTargetVariant(genome: HeuristicGenome): ArenaSerializableVariant {
  return {
    id: genome.id,
    kind: "minimax",
    weights: genome.weights,
    minimaxConfig: DEFAULT_MINIMAX_CONFIG
  };
}

function nextTargetPopulation(
  scored: Array<{genome: HeuristicGenome; score: TargetTrainingGenomeScore}>,
  config: EvolutionConfig,
  seed: string
): HeuristicGenome[] {
  const next = scored.slice(0, config.elitism).map((entry) => ({id: entry.genome.id, weights: entry.genome.weights}));
  while (next.length < config.population) {
    const childIndex = next.length;
    const childId = `child-${seed.split(":").at(-1) ?? "generation"}-${childIndex}`;
    const left = selectParent(
      scored.map((entry) => ({genome: entry.genome, fitness: entry.score.fitness})),
      `${seed}:parent-left:${childIndex}`,
      config.tournamentSize
    );
    const right = selectParent(
      scored.map((entry) => ({genome: entry.genome, fitness: entry.score.fitness})),
      `${seed}:parent-right:${childIndex}`,
      config.tournamentSize
    );
    const crossed = crossoverGenomes(left, right, `${seed}:crossover:${childIndex}`, childId);
    next.push(mutateGenome(crossed, `${seed}:mutation:${childIndex}`, config.mutationRate, childId));
  }
  return next;
}

function seededShuffle(genomes: HeuristicGenome[], seed: string): HeuristicGenome[] {
  const rng = createRng(seed);
  const shuffled = genomes.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function sideForGenome(match: ArenaMatchResultSummary, genomeId: string): ArenaAgentId | undefined {
  if (match.agentA.id === genomeId) return "agentA";
  if (match.agentB.id === genomeId) return "agentB";
  return undefined;
}

function oppositeAgent(side: ArenaAgentId): ArenaAgentId {
  return side === "agentA" ? "agentB" : "agentA";
}

function isMaxTurnTie(game: ArenaMatchResultSummary["pairs"][number]["games"][number]): boolean {
  return game.winner === "tie" && game.errors.some((error) => error.includes("Reached max turn limit"));
}

function emptyScoreBreakdown(): TargetTrainingScoreBreakdown {
  return {
    doubleSideWinScore: 0,
    gameWinScore: 0,
    splitPairScore: 0,
    tieScore: 0,
    qualityScore: 0,
    lossPenalty: 0,
    maxTurnTiePenalty: 0,
    total: 0
  };
}

function selectBetterScore(left: TargetTrainingGenomeScore | undefined, right: TargetTrainingGenomeScore): TargetTrainingGenomeScore {
  if (!left) return right;
  return right.fitness > left.fitness || (right.fitness === left.fitness && right.id.localeCompare(left.id) < 0) ? right : left;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

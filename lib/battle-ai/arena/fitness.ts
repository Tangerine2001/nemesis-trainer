import type {ArenaAgentId, ArenaGameResult, ArenaMatchResultSummary} from "@/lib/battle-ai/arena/types";

const DOUBLE_SIDE_WIN = 1000;
const SHARED_WIN = 400;
const GAME_WIN = 110;
const SURVIVOR_WEIGHT = 18;
const HP_WEIGHT = 12;
const TURN_DECISIVENESS = 0.8;
const FALLBACK_PENALTY = 8;
const ERROR_PENALTY = 80;

export function scoreMatchFitness(match: Omit<ArenaMatchResultSummary, "fitness">): Record<ArenaAgentId, number> {
  const scores: Record<ArenaAgentId, number> = {agentA: 0, agentB: 0};

  if (match.result === "shared-win-tie") {
    scores.agentA += SHARED_WIN;
    scores.agentB += SHARED_WIN;
  } else {
    scores[match.result] += DOUBLE_SIDE_WIN;
  }

  for (const pair of match.pairs) {
    for (const game of pair.games) {
      addGameFitness(scores, game);
    }
  }

  return scores;
}

function addGameFitness(scores: Record<ArenaAgentId, number>, game: ArenaGameResult): void {
  for (const agentId of ["agentA", "agentB"] as const) {
    const quality = game.final[agentId];
    scores[agentId] += quality.remainingPokemon * SURVIVOR_WEIGHT;
    scores[agentId] += quality.hpFraction * HP_WEIGHT;
  }

  if (game.winner !== "tie") {
    scores[game.winner] += GAME_WIN + Math.max(0, 120 - game.turns) * TURN_DECISIVENESS;
  }

  const penalty = game.fallbackChoices * FALLBACK_PENALTY + game.errors.length * ERROR_PENALTY;
  scores.agentA -= penalty;
  scores.agentB -= penalty;
}

import type {BattlePokemonView, BattleSideView, BattleSnapshot} from "@/lib/types";

export type BattleEvaluationPerspective = "user" | "nemesis";

const TERMINAL_SCORE = 1_000_000;

export interface EvaluationWeights {
  alive: number;
  totalHp: number;
  activeHp: number;
  status: Record<string, number>;
}

export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  alive: 180,
  totalHp: 120,
  activeHp: 45,
  status: {
    brn: 25,
    par: 25,
    psn: 15,
    tox: 30,
    slp: 45,
    frz: 45
  }
};

export const EVALUATION_WEIGHT_BOUNDS: Record<keyof Omit<EvaluationWeights, "status">, {min: number; max: number}> = {
  alive: {min: 50, max: 450},
  totalHp: {min: 20, max: 300},
  activeHp: {min: 0, max: 180}
};

export const STATUS_WEIGHT_BOUNDS: Record<string, {min: number; max: number}> = {
  brn: {min: 0, max: 90},
  par: {min: 0, max: 90},
  psn: {min: 0, max: 75},
  tox: {min: 0, max: 100},
  slp: {min: 0, max: 120},
  frz: {min: 0, max: 120}
};

export type BattleEvaluator = (snapshot: BattleSnapshot, perspective: BattleEvaluationPerspective) => number;

export function createEvaluator(weights: EvaluationWeights = DEFAULT_EVALUATION_WEIGHTS): BattleEvaluator {
  return (snapshot, perspective) => evaluateBattleState(snapshot, perspective, weights);
}

export function evaluateBattleState(
  snapshot: BattleSnapshot,
  perspective: BattleEvaluationPerspective,
  weights: EvaluationWeights = DEFAULT_EVALUATION_WEIGHTS
): number {
  if (snapshot.ended) {
    if (!snapshot.winner) return 0;
    return snapshot.winner === perspective ? TERMINAL_SCORE : -TERMINAL_SCORE;
  }

  const own = perspective === "user" ? snapshot.user : snapshot.opponent;
  const opposing = perspective === "user" ? snapshot.opponent : snapshot.user;

  return (
    aliveScore(own, opposing, weights) +
    totalHpScore(own, opposing, weights) +
    activeHpScore(own, opposing, weights) +
    statusScore(own, opposing, weights)
  );
}

function aliveScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (aliveCount(own) - aliveCount(opposing)) * weights.alive;
}

function totalHpScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (hpTotal(own) - hpTotal(opposing)) * weights.totalHp;
}

function activeHpScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (activeHp(own) - activeHp(opposing)) * weights.activeHp;
}

function statusScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return sideStatusPenalty(opposing, weights) - sideStatusPenalty(own, weights);
}

function aliveCount(side: BattleSideView): number {
  return side.pokemon.filter((pokemon) => !pokemon.fainted).length;
}

function hpTotal(side: BattleSideView): number {
  return side.pokemon.reduce((total, pokemon) => total + hpFraction(pokemon), 0);
}

function activeHp(side: BattleSideView): number {
  const active = side.pokemon.find((pokemon) => pokemon.active);
  return active ? hpFraction(active) : 0;
}

function sideStatusPenalty(side: BattleSideView, weights: EvaluationWeights): number {
  return side.pokemon.reduce((total, pokemon) => total + statusPenalty(pokemon, weights), 0);
}

export function hpFraction(pokemon: BattlePokemonView): number {
  if (pokemon.fainted || isFaintedCondition(pokemon.condition)) return 0;

  const match = pokemon.condition.match(/(\d+)\/(\d+)/);
  if (!match) return 1;

  const current = Number.parseInt(match[1], 10);
  const max = Number.parseInt(match[2], 10);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return 1;
  return Math.max(0, Math.min(1, current / max));
}

function statusPenalty(pokemon: BattlePokemonView, weights: EvaluationWeights): number {
  const status = pokemon.condition.split(/\s+/).find((part) => part in weights.status);
  return status ? weights.status[status] : 0;
}

function isFaintedCondition(condition: string): boolean {
  return condition.includes("fnt") || condition.startsWith("0 ");
}

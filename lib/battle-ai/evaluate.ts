import type {BattlePokemonView, BattleSideView, BattleSnapshot} from "@/lib/types";

export type BattleEvaluationPerspective = "user" | "nemesis";

const TERMINAL_SCORE = 1_000_000;
const ALIVE_WEIGHT = 180;
const TOTAL_HP_WEIGHT = 120;
const ACTIVE_HP_WEIGHT = 45;

const STATUS_WEIGHTS: Record<string, number> = {
  brn: 25,
  par: 25,
  psn: 15,
  tox: 30,
  slp: 45,
  frz: 45
};

export function evaluateBattleState(snapshot: BattleSnapshot, perspective: BattleEvaluationPerspective): number {
  if (snapshot.ended) {
    if (!snapshot.winner) return 0;
    return snapshot.winner === perspective ? TERMINAL_SCORE : -TERMINAL_SCORE;
  }

  const own = perspective === "user" ? snapshot.user : snapshot.opponent;
  const opposing = perspective === "user" ? snapshot.opponent : snapshot.user;

  return (
    aliveScore(own, opposing) +
    totalHpScore(own, opposing) +
    activeHpScore(own, opposing) +
    statusScore(own, opposing)
  );
}

function aliveScore(own: BattleSideView, opposing: BattleSideView): number {
  return (aliveCount(own) - aliveCount(opposing)) * ALIVE_WEIGHT;
}

function totalHpScore(own: BattleSideView, opposing: BattleSideView): number {
  return (hpTotal(own) - hpTotal(opposing)) * TOTAL_HP_WEIGHT;
}

function activeHpScore(own: BattleSideView, opposing: BattleSideView): number {
  return (activeHp(own) - activeHp(opposing)) * ACTIVE_HP_WEIGHT;
}

function statusScore(own: BattleSideView, opposing: BattleSideView): number {
  return sideStatusPenalty(opposing) - sideStatusPenalty(own);
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

function sideStatusPenalty(side: BattleSideView): number {
  return side.pokemon.reduce((total, pokemon) => total + statusPenalty(pokemon), 0);
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

function statusPenalty(pokemon: BattlePokemonView): number {
  const status = pokemon.condition.split(/\s+/).find((part) => part in STATUS_WEIGHTS);
  return status ? STATUS_WEIGHTS[status] : 0;
}

function isFaintedCondition(condition: string): boolean {
  return condition.includes("fnt") || condition.startsWith("0 ");
}

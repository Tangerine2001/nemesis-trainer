import {
  DISRUPTION_MOVES,
  HAZARD_MOVES,
  HAZARD_REMOVAL_MOVES,
  PRIORITY_MOVES,
  RECOVERY_MOVES,
  SETUP_ANSWER_MOVES,
  SETUP_MOVES,
  SPEED_CONTROL_MOVES,
  getSpeciesDatum,
  moveType,
  toId,
  typeEffectiveness
} from "@/lib/battle-data";
import type {BattlePokemonView, BattleSideView, BattleSnapshot} from "@/lib/types";

export type BattleEvaluationPerspective = "user" | "nemesis";

const TERMINAL_SCORE = 1_000_000;
const PRESSURE_MULTIPLIER_CAP = 4;

export interface EvaluationWeights {
  alive: number;
  totalHp: number;
  activeHp: number;
  status: Record<string, number>;
  typePressure: number;
  speedPressure: number;
  moveUtility: number;
  itemAbility: number;
}

export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  alive: 180,
  totalHp: 120,
  activeHp: 45,
  typePressure: 70,
  speedPressure: 35,
  moveUtility: 28,
  itemAbility: 22,
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
  activeHp: {min: 0, max: 180},
  typePressure: {min: 0, max: 220},
  speedPressure: {min: 0, max: 160},
  moveUtility: {min: 0, max: 140},
  itemAbility: {min: 0, max: 120}
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
    statusScore(own, opposing, weights) +
    typePressureScore(own, opposing, weights) +
    speedPressureScore(own, opposing, weights) +
    moveUtilityScore(own, opposing, weights) +
    itemAbilityScore(own, opposing, weights)
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

function typePressureScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (sideTypePressure(own, opposing) - sideTypePressure(opposing, own)) * weights.typePressure;
}

function speedPressureScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return speedAdvantage(own, opposing) * weights.speedPressure;
}

function moveUtilityScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (sideMoveUtility(own) - sideMoveUtility(opposing)) * weights.moveUtility;
}

function itemAbilityScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (sideItemAbilityUtility(own) - sideItemAbilityUtility(opposing)) * weights.itemAbility;
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

function sideTypePressure(own: BattleSideView, opposing: BattleSideView): number {
  const activeOwn = activePokemon(own);
  const activeOpposing = activePokemon(opposing);
  if (!activeOwn || !activeOpposing) return 0;

  const opposingTypes = getSpeciesDatum(activeOpposing.species)?.types;
  if (!opposingTypes) return 0;

  return Math.min(PRESSURE_MULTIPLIER_CAP, bestMoveEffectiveness(activeOwn, opposingTypes)) * hpFraction(activeOwn);
}

function speedAdvantage(own: BattleSideView, opposing: BattleSideView): number {
  const activeOwn = activePokemon(own);
  const activeOpposing = activePokemon(opposing);
  if (!activeOwn || !activeOpposing) return 0;

  const ownSpeed = getSpeciesDatum(activeOwn.species)?.baseSpeed;
  const opposingSpeed = getSpeciesDatum(activeOpposing.species)?.baseSpeed;
  if (!ownSpeed || !opposingSpeed) return 0;

  const prioritySwing = hasKnownPriority(activeOwn) && !hasKnownPriority(activeOpposing) ? 0.45 : !hasKnownPriority(activeOwn) && hasKnownPriority(activeOpposing) ? -0.45 : 0;
  const raw = (ownSpeed - opposingSpeed) / 100;
  return clamp(raw, -1.5, 1.5) + prioritySwing;
}

function sideMoveUtility(side: BattleSideView): number {
  return side.pokemon.reduce((total, pokemon) => {
    if (pokemon.fainted) return total;
    return total + knownMoves(pokemon).reduce((moveTotal, move) => moveTotal + moveUtility(move, pokemon.active), 0);
  }, 0);
}

function sideItemAbilityUtility(side: BattleSideView): number {
  return side.pokemon.reduce((total, pokemon) => {
    if (pokemon.fainted) return total;
    return total + itemUtility(pokemon.item) + abilityUtility(pokemon.ability);
  }, 0);
}

function bestMoveEffectiveness(attacker: BattlePokemonView, defenderTypes: NonNullable<ReturnType<typeof getSpeciesDatum>>["types"]): number {
  return knownMoves(attacker).reduce((best, move) => {
    const attackType = moveType(move);
    return attackType ? Math.max(best, typeEffectiveness(attackType, defenderTypes)) : best;
  }, 0);
}

function moveUtility(move: string, active: boolean): number {
  const normalized = move.toLowerCase();
  let score = 0;
  if (moveType(normalized)) score += 0.1;
  if (moveSetHas(PRIORITY_MOVES, normalized)) score += 0.45;
  if (moveSetHas(SPEED_CONTROL_MOVES, normalized)) score += 0.3;
  if (moveSetHas(HAZARD_MOVES, normalized)) score += active ? 0.35 : 0.2;
  if (moveSetHas(HAZARD_REMOVAL_MOVES, normalized)) score += 0.35;
  if (moveSetHas(SETUP_MOVES, normalized)) score += active ? 0.25 : 0.15;
  if (moveSetHas(SETUP_ANSWER_MOVES, normalized)) score += 0.35;
  if (moveSetHas(DISRUPTION_MOVES, normalized)) score += 0.25;
  if (moveSetHas(RECOVERY_MOVES, normalized)) score += 0.2;
  return score;
}

function itemUtility(item: string | undefined): number {
  const id = normalizeText(item);
  if (!id) return 0;
  if (id.includes("choice") || id.includes("boosterenergy") || id.includes("focussash") || id.includes("leftovers")) return 0.45;
  if (id.includes("heavydutyboots") || id.includes("airballoon") || id.includes("lifeorb")) return 0.35;
  return 0.15;
}

function abilityUtility(ability: string | undefined): number {
  const id = normalizeText(ability);
  if (!id) return 0;
  if (["protosynthesis", "quarkdrive", "supremeoverlord", "multiscale", "goodasgold", "unaware", "regenerator"].includes(id)) return 0.45;
  if (["pressure", "intimidate", "flashfire", "waterabsorb", "toxicdebris"].includes(id)) return 0.3;
  return 0.12;
}

function activePokemon(side: BattleSideView): BattlePokemonView | undefined {
  return side.pokemon.find((pokemon) => pokemon.active && !pokemon.fainted);
}

function hasKnownPriority(pokemon: BattlePokemonView): boolean {
  return knownMoves(pokemon).some((move) => moveSetHas(PRIORITY_MOVES, move));
}

function knownMoves(pokemon: BattlePokemonView): string[] {
  return pokemon.moves.map((move) => move.toLowerCase());
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

function normalizeText(value: string | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
}

function moveSetHas(moveSet: Set<string>, move: string): boolean {
  const lower = move.toLowerCase();
  const id = toId(move);
  return moveSet.has(lower) || [...moveSet].some((entry) => toId(entry) === id);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isFaintedCondition(condition: string): boolean {
  return condition.includes("fnt") || condition.startsWith("0 ");
}

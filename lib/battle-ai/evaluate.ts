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
  koThreat: number;
  boost: number;
  sideCondition: number;
  endgame: number;
}

export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  alive: 180,
  totalHp: 120,
  activeHp: 45,
  typePressure: 70,
  speedPressure: 35,
  moveUtility: 28,
  itemAbility: 22,
  koThreat: 95,
  boost: 35,
  sideCondition: 32,
  endgame: 55,
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
  itemAbility: {min: 0, max: 120},
  koThreat: {min: 0, max: 240},
  boost: {min: 0, max: 160},
  sideCondition: {min: 0, max: 140},
  endgame: {min: 0, max: 180}
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

export function createEvaluator(weights: Partial<EvaluationWeights> = DEFAULT_EVALUATION_WEIGHTS): BattleEvaluator {
  const normalized = normalizeWeights(weights);
  return (snapshot, perspective) => evaluateBattleStateWithWeights(snapshot, perspective, normalized);
}

export function evaluateBattleState(
  snapshot: BattleSnapshot,
  perspective: BattleEvaluationPerspective,
  weightsInput: Partial<EvaluationWeights> = DEFAULT_EVALUATION_WEIGHTS
): number {
  return evaluateBattleStateWithWeights(snapshot, perspective, normalizeWeights(weightsInput));
}

function evaluateBattleStateWithWeights(
  snapshot: BattleSnapshot,
  perspective: BattleEvaluationPerspective,
  weights: EvaluationWeights
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
    itemAbilityScore(own, opposing, weights) +
    koThreatScore(own, opposing, weights) +
    boostScore(own, opposing, weights) +
    sideConditionScore(own, opposing, weights) +
    endgameScore(own, opposing, weights)
  );
}

function normalizeWeights(weights: Partial<EvaluationWeights>): EvaluationWeights {
  return {
    ...DEFAULT_EVALUATION_WEIGHTS,
    ...weights,
    status: {
      ...DEFAULT_EVALUATION_WEIGHTS.status,
      ...(weights.status ?? {})
    }
  };
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

function koThreatScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (immediateThreat(own, opposing) - immediateThreat(opposing, own)) * weights.koThreat;
}

function boostScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (sideBoostValue(own) - sideBoostValue(opposing)) * weights.boost;
}

function sideConditionScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  return (sideConditionPressure(opposing) - sideConditionPressure(own)) * weights.sideCondition;
}

function endgameScore(own: BattleSideView, opposing: BattleSideView, weights: EvaluationWeights): number {
  const ownAlive = aliveCount(own);
  const opposingAlive = aliveCount(opposing);
  if (ownAlive + opposingAlive > 4) return 0;

  const ownActive = activePokemon(own);
  const opposingActive = activePokemon(opposing);
  const prioritySwing =
    ownActive && opposingActive
      ? (hasKnownPriority(ownActive) ? 0.25 : 0) - (hasKnownPriority(opposingActive) ? 0.25 : 0)
      : 0;

  return ((ownAlive - opposingAlive) * 0.6 + activeHp(own) * 0.2 - activeHp(opposing) * 0.2 + speedAdvantage(own, opposing) * 0.25 + prioritySwing) * weights.endgame;
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

function immediateThreat(attackerSide: BattleSideView, defenderSide: BattleSideView): number {
  const attacker = activePokemon(attackerSide);
  const defender = activePokemon(defenderSide);
  if (!attacker || !defender) return 0;

  const defenderTypes = getSpeciesDatum(defender.species)?.types;
  if (!defenderTypes) return 0;

  const defenderHp = hpFraction(defender);
  const bestEffectiveness = bestMoveEffectiveness(attacker, defenderTypes);
  if (bestEffectiveness <= 0) return 0;

  const priorityBonus = hasKnownPriority(attacker) && defenderHp <= 0.3 ? 0.25 : 0;
  if (bestEffectiveness >= 2 && defenderHp <= 0.55) return 1 + priorityBonus;
  if (bestEffectiveness >= 1 && defenderHp <= 0.28) return 0.8 + priorityBonus;

  return clamp((bestEffectiveness - 1) * (1 - defenderHp) + priorityBonus, 0, 1.1);
}

function sideBoostValue(side: BattleSideView): number {
  return side.pokemon.reduce((total, pokemon) => {
    if (pokemon.fainted || !pokemon.boosts) return total;
    const hpScale = pokemon.active ? 0.7 + hpFraction(pokemon) * 0.3 : 0.45 + hpFraction(pokemon) * 0.25;
    return total + boostValue(pokemon.boosts) * hpScale;
  }, 0);
}

function boostValue(boosts: NonNullable<BattlePokemonView["boosts"]>): number {
  const stageWeights: Record<string, number> = {
    atk: 0.18,
    def: 0.12,
    spa: 0.18,
    spd: 0.12,
    spe: 0.22,
    accuracy: 0.08,
    evasion: 0.08
  };
  return Object.entries(boosts).reduce((total, [stat, stage]) => total + (stageWeights[stat] ?? 0) * (stage ?? 0), 0);
}

function sideConditionPressure(side: BattleSideView): number {
  return (side.conditions ?? []).reduce((total, condition) => total + conditionPressure(condition.id, condition.layers), 0);
}

function conditionPressure(id: string, layers = 1): number {
  const normalized = normalizeText(id);
  if (normalized === "stealthrock") return 0.5;
  if (normalized === "spikes") return clamp(layers, 1, 3) * 0.35;
  if (normalized === "toxicspikes") return clamp(layers, 1, 2) * 0.3;
  if (normalized === "stickyweb") return 0.4;
  if (normalized === "reflect" || normalized === "lightscreen") return -0.35;
  if (normalized === "auroraveil") return -0.55;
  return 0;
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

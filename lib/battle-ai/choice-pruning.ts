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
import {tieBreak} from "@/lib/battle-ai/policy";
import type {BattleEvaluationPerspective} from "@/lib/battle-ai/evaluate";
import type {AiRequest} from "@/lib/battle-ai/policy";
import type {BattleChoice, BattlePokemonView, BattleSideView, BattleSnapshot} from "@/lib/types";

interface RankedChoice {
  choice: BattleChoice;
  score: number;
}

export function rankBattleChoices({
  choices,
  request,
  snapshot,
  perspective,
  seed,
  mode
}: {
  choices: BattleChoice[];
  request?: AiRequest;
  snapshot: BattleSnapshot;
  perspective: BattleEvaluationPerspective;
  seed: string;
  mode: "max" | "min";
}): BattleChoice[] {
  return choices
    .map((choice) => ({choice, score: choicePriorityScore(choice, request, snapshot, perspective)}))
    .sort((left, right) => compareRankedChoices(left, right, seed, mode))
    .map((entry) => entry.choice);
}

export function pruneBattleChoices({
  choices,
  request,
  snapshot,
  perspective,
  seed,
  mode,
  limit
}: {
  choices: BattleChoice[];
  request?: AiRequest;
  snapshot: BattleSnapshot;
  perspective: BattleEvaluationPerspective;
  seed: string;
  mode: "max" | "min";
  limit: number;
}): BattleChoice[] {
  const ranked = rankBattleChoices({choices, request, snapshot, perspective, seed, mode});
  if (limit <= 0 || ranked.length <= limit) return ranked;
  return ranked.slice(0, Math.max(1, limit));
}

function compareRankedChoices(left: RankedChoice, right: RankedChoice, seed: string, mode: "max" | "min"): number {
  const score = right.score - left.score;
  if (score !== 0) return mode === "max" ? score : -score;
  const seeded = tieBreak(seed, right.choice.id) - tieBreak(seed, left.choice.id);
  return mode === "max" ? seeded : -seeded;
}

function choicePriorityScore(
  choice: BattleChoice,
  request: AiRequest | undefined,
  snapshot: BattleSnapshot,
  perspective: BattleEvaluationPerspective
): number {
  if (choice.kind === "switch") return switchScore(choice, snapshot, perspective);

  const move = moveForChoice(choice, request);
  const moveName = move?.move ?? choice.label;
  const normalized = moveName.toLowerCase();
  const {own, opposing} = sidesForPerspective(snapshot, perspective);
  const ownActive = activePokemon(own);
  const opposingActive = activePokemon(opposing);
  let score = 10;

  const attackType = moveType(moveName);
  if (attackType && opposingActive) {
    const defenderTypes = getSpeciesDatum(opposingActive.species)?.types;
    if (defenderTypes) {
      const effectiveness = typeEffectiveness(attackType, defenderTypes);
      score += effectivenessScore(effectiveness);
      if (hpFraction(opposingActive) <= 0.35 && effectiveness >= 1) score += 6;
    }
    if (ownActive && getSpeciesDatum(ownActive.species)?.types.includes(attackType)) score += 2;
  }

  if (moveSetHas(PRIORITY_MOVES, normalized)) score += 4;
  if (moveSetHas(SPEED_CONTROL_MOVES, normalized)) score += slowerThanOpponent(ownActive, opposingActive) ? 5 : 2;
  if (moveSetHas(HAZARD_MOVES, normalized)) score += snapshot.turn <= 3 ? 5 : 2;
  if (moveSetHas(HAZARD_REMOVAL_MOVES, normalized)) score += 4;
  if (moveSetHas(SETUP_MOVES, normalized)) score += setupScore(ownActive, opposingActive);
  if (moveSetHas(SETUP_ANSWER_MOVES, normalized)) score += 4;
  if (moveSetHas(DISRUPTION_MOVES, normalized)) score += 3;
  if (moveSetHas(RECOVERY_MOVES, normalized)) score += ownActive && hpFraction(ownActive) < 0.55 ? 5 : 1;
  if (move && move.pp <= Math.max(1, Math.floor(move.maxpp * 0.15))) score -= 2;

  return score;
}

function switchScore(choice: BattleChoice, snapshot: BattleSnapshot, perspective: BattleEvaluationPerspective): number {
  const {own, opposing} = sidesForPerspective(snapshot, perspective);
  const ownActive = activePokemon(own);
  const opposingActive = activePokemon(opposing);
  const switchTarget = own.pokemon.find((pokemon) => choice.label.toLowerCase().includes(pokemon.species.toLowerCase()));
  if (!switchTarget || switchTarget.fainted) return 0;

  let score = 4 + hpFraction(switchTarget) * 3;
  if (ownActive && hpFraction(ownActive) < 0.35) score += 4;
  if (opposingActive) {
    const targetDatum = getSpeciesDatum(switchTarget.species);
    const opposingPressure = targetDatum ? bestMovePressure(opposingActive, targetDatum.types) : 1;
    score -= Math.max(0, opposingPressure - 1) * 3;
  }
  return score;
}

function moveForChoice(choice: BattleChoice, request?: AiRequest) {
  if (!choice.id.startsWith("move ")) return undefined;
  const index = Number.parseInt(choice.id.slice("move ".length), 10) - 1;
  return Number.isInteger(index) ? request?.active?.[0]?.moves[index] : undefined;
}

function sidesForPerspective(snapshot: BattleSnapshot, perspective: BattleEvaluationPerspective): {own: BattleSideView; opposing: BattleSideView} {
  return perspective === "user" ? {own: snapshot.user, opposing: snapshot.opponent} : {own: snapshot.opponent, opposing: snapshot.user};
}

function activePokemon(side: BattleSideView): BattlePokemonView | undefined {
  return side.pokemon.find((pokemon) => pokemon.active && !pokemon.fainted);
}

function bestMovePressure(attacker: BattlePokemonView, defenderTypes: NonNullable<ReturnType<typeof getSpeciesDatum>>["types"]): number {
  return attacker.moves.reduce((best, move) => {
    const attackType = moveType(move);
    return attackType ? Math.max(best, typeEffectiveness(attackType, defenderTypes)) : best;
  }, 1);
}

function effectivenessScore(effectiveness: number): number {
  if (effectiveness >= 4) return 12;
  if (effectiveness >= 2) return 8;
  if (effectiveness === 0) return -12;
  if (effectiveness < 1) return -4;
  return 2;
}

function setupScore(ownActive: BattlePokemonView | undefined, opposingActive: BattlePokemonView | undefined): number {
  if (!ownActive) return 1;
  if (hpFraction(ownActive) > 0.75 && (!opposingActive || !slowerThanOpponent(ownActive, opposingActive))) return 4;
  if (hpFraction(ownActive) < 0.35) return -2;
  return 1;
}

function slowerThanOpponent(ownActive: BattlePokemonView | undefined, opposingActive: BattlePokemonView | undefined): boolean {
  const ownSpeed = ownActive ? getSpeciesDatum(ownActive.species)?.baseSpeed : undefined;
  const opposingSpeed = opposingActive ? getSpeciesDatum(opposingActive.species)?.baseSpeed : undefined;
  return Boolean(ownSpeed && opposingSpeed && ownSpeed < opposingSpeed);
}

function hpFraction(pokemon: BattlePokemonView): number {
  if (pokemon.fainted || pokemon.condition.includes("fnt")) return 0;
  const match = pokemon.condition.match(/(\d+)\/(\d+)/);
  if (!match) return 1;
  const current = Number.parseInt(match[1], 10);
  const max = Number.parseInt(match[2], 10);
  return Number.isFinite(current) && Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(1, current / max)) : 1;
}

function moveSetHas(moveSet: Set<string>, move: string): boolean {
  const lower = move.toLowerCase();
  const id = toId(move);
  return moveSet.has(lower) || [...moveSet].some((entry) => toId(entry) === id);
}

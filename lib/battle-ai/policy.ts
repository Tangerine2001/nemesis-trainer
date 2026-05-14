import {hashString} from "@/lib/boss-generator/random";
import type {BattleEvaluationPerspective, BattleEvaluator} from "@/lib/battle-ai/evaluate";
import type {BattleChoice, BattleSnapshot} from "@/lib/types";

export interface AiMoveRequest {
  move: string;
  id: string;
  pp: number;
  maxpp: number;
  target: string;
  disabled?: boolean;
}

export interface AiPokemonRequest {
  ident: string;
  details: string;
  condition: string;
  active?: boolean;
  item?: string;
  ability?: string;
  teraType?: string;
  moves?: string[];
}

export interface AiSideRequest {
  name: string;
  id: "p1" | "p2";
  pokemon: AiPokemonRequest[];
}

export interface AiRequest {
  rqid?: number;
  wait?: boolean;
  teamPreview?: boolean;
  forceSwitch?: boolean[];
  active?: Array<{moves: AiMoveRequest[]; trapped?: boolean}>;
  side: AiSideRequest;
}

export interface BattlePolicyContext {
  seed: string;
  perspective?: BattleEvaluationPerspective;
  evaluator?: BattleEvaluator;
  request?: AiRequest;
  snapshot: BattleSnapshot;
  legalChoices: BattleChoice[];
  simulateChoice?: (choice: BattleChoice) => BattleSnapshot | undefined;
  simulateUserChoice?: (aiChoice: BattleChoice, userChoice: BattleChoice) => BattleSnapshot | undefined;
}

export interface BattleDecision {
  choice?: BattleChoice;
  score?: number;
  reason?: string;
  nodesEvaluated?: number;
}

export interface BattlePolicy {
  choose(context: BattlePolicyContext): BattleDecision;
}

export function enabledChoices(choices: BattleChoice[]): BattleChoice[] {
  return choices.filter((choice) => !choice.disabled);
}

export function tieBreak(seed: string, choiceId: string): number {
  return (hashString(`${seed}:${choiceId}`) % 1000) / 1000;
}

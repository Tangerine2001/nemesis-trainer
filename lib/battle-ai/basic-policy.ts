import {Dex} from "pokemon-showdown/dist/sim/dex";
import {enabledChoices, tieBreak} from "@/lib/battle-ai/policy";
import type {BattleDecision, BattlePolicy, BattlePolicyContext} from "@/lib/battle-ai/policy";
import type {BattleChoice} from "@/lib/types";

export const basicPolicy: BattlePolicy = {
  choose(context) {
    return chooseBasicBattleAction(context);
  }
};

export function chooseBasicBattleAction(context: BattlePolicyContext): BattleDecision {
  const choices = enabledChoices(context.legalChoices);
  if (!choices.length) return {};

  const switches = choices.filter((choice) => choice.kind === "switch");
  if (context.request?.forceSwitch?.some(Boolean) && switches.length) {
    return {choice: switches[0], score: Number.POSITIVE_INFINITY, reason: "forced switch"};
  }

  let best = choices[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const choice of choices) {
    const score = scoreBasicChoice(choice, context);
    if (score > bestScore) {
      best = choice;
      bestScore = score;
    }
  }

  return {choice: best, score: bestScore, reason: "basic rule score", nodesEvaluated: choices.length};
}

export function scoreBasicChoice(choice: BattleChoice, context: BattlePolicyContext): number {
  if (choice.kind === "switch") return 10 + tieBreak(context.seed, choice.id);

  const moveIndex = Number.parseInt(choice.id.replace("move ", ""), 10) - 1;
  const moveRequest = context.request?.active?.[0]?.moves[moveIndex];
  const move = Dex.moves.get(moveRequest?.id ?? choice.label);
  const statusBonus = move.category === "Status" ? statusMoveBonus(move.id) : 0;
  return (move.basePower || 0) + move.priority * 18 + statusBonus + tieBreak(context.seed, choice.id);
}

function statusMoveBonus(moveId: string): number {
  if (["stealthrock", "spikes", "toxicspikes", "stickyweb"].includes(moveId)) return 55;
  if (["dragondance", "swordsdance", "nastyplot", "calmmind", "shellsmash", "quiverdance", "irondefense"].includes(moveId)) {
    return 45;
  }
  if (["encore", "taunt", "willowisp", "thunderwave", "substitute"].includes(moveId)) return 35;
  return 20;
}

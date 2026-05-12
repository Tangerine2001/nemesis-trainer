import {basicPolicy} from "@/lib/battle-ai/basic-policy";
import {evaluateBattleState} from "@/lib/battle-ai/evaluate";
import {enabledChoices, tieBreak} from "@/lib/battle-ai/policy";
import type {BattleDecision, BattlePolicy, BattlePolicyContext} from "@/lib/battle-ai/policy";

export const greedyPolicy: BattlePolicy = {
  choose(context) {
    return chooseGreedyBattleAction(context);
  }
};

export function chooseGreedyBattleAction(context: BattlePolicyContext): BattleDecision {
  const choices = enabledChoices(context.legalChoices);
  if (!choices.length) return {};

  const switches = choices.filter((choice) => choice.kind === "switch");
  if (context.request?.forceSwitch?.some(Boolean) && switches.length) {
    return {choice: switches[0], score: Number.POSITIVE_INFINITY, reason: "forced switch"};
  }

  if (!context.simulateChoice) return basicPolicy.choose(context);

  let best = choices[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let nodesEvaluated = 0;

  for (const choice of choices) {
    const simulated = context.simulateChoice(choice);
    if (!simulated) continue;
    nodesEvaluated += 1;

    const score = evaluateBattleState(simulated, "nemesis") + tieBreak(context.seed, choice.id);
    if (score > bestScore) {
      best = choice;
      bestScore = score;
    }
  }

  if (nodesEvaluated === 0) return basicPolicy.choose(context);
  return {choice: best, score: bestScore, reason: "greedy one-ply evaluation", nodesEvaluated};
}

import {basicPolicy} from "@/lib/battle-ai/basic-policy";
import {evaluateBattleState} from "@/lib/battle-ai/evaluate";
import {greedyPolicy} from "@/lib/battle-ai/greedy-policy";
import {enabledChoices, tieBreak} from "@/lib/battle-ai/policy";
import type {BattleDecision, BattlePolicy, BattlePolicyContext} from "@/lib/battle-ai/policy";
import type {BattleChoice, BattleSnapshot} from "@/lib/types";

export interface MinimaxPolicyConfig {
  depth: number;
  nodeBudget: number;
  timeBudgetMs: number;
  maxLegalChoices: number;
}

interface SearchState {
  startedAt: number;
  nodesEvaluated: number;
  budgetHit: boolean;
}

interface SimulatedRoot {
  choice: BattleChoice;
  snapshot: BattleSnapshot;
  score: number;
}

export const DEFAULT_MINIMAX_CONFIG: MinimaxPolicyConfig = {
  depth: 2,
  nodeBudget: 250,
  timeBudgetMs: 250,
  maxLegalChoices: 8
};

export const minimaxPolicy: BattlePolicy = {
  choose(context) {
    return chooseMinimaxBattleAction(context);
  }
};

export function createMinimaxPolicy(config: Partial<MinimaxPolicyConfig>): BattlePolicy {
  return {
    choose(context) {
      return chooseMinimaxBattleAction(context, config);
    }
  };
}

export function chooseMinimaxBattleAction(
  context: BattlePolicyContext,
  configOverrides: Partial<MinimaxPolicyConfig> = {}
): BattleDecision {
  const config = {...DEFAULT_MINIMAX_CONFIG, ...configOverrides};
  const choices = enabledChoices(context.legalChoices);
  if (!choices.length) return {};

  const switches = choices.filter((choice) => choice.kind === "switch");
  if (context.request?.forceSwitch?.some(Boolean) && switches.length) {
    return {choice: switches[0], score: Number.POSITIVE_INFINITY, reason: "forced switch", nodesEvaluated: 0};
  }

  if (!context.simulateChoice || config.depth < 1) return greedyPolicy.choose(context);

  const search: SearchState = {startedAt: Date.now(), nodesEvaluated: 0, budgetHit: false};
  const roots = simulateRootChoices(context, choices, config, search);
  if (!roots.length) return fallbackDecision(context, search.nodesEvaluated, "minimax simulation fallback");

  let best: BattleChoice | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  let completedRoots = 0;
  let alpha = Number.NEGATIVE_INFINITY;

  for (const root of roots) {
    if (!canSearch(search, config)) break;
    const result = evaluateRootChoice(context, root, config, search, alpha, Number.POSITIVE_INFINITY);
    if (!result.complete) continue;

    completedRoots += 1;
    const score = result.score + tieBreak(context.seed, root.choice.id);
    if (score > bestScore) {
      best = root.choice;
      bestScore = score;
    }
    alpha = Math.max(alpha, bestScore);
  }

  if (!best || completedRoots === 0) {
    return fallbackDecision(context, search.nodesEvaluated, search.budgetHit ? "minimax budget fallback" : "minimax fallback");
  }

  return {
    choice: best,
    score: bestScore,
    reason: search.budgetHit ? `minimax depth ${config.depth} budget fallback` : `minimax depth ${config.depth}`,
    nodesEvaluated: search.nodesEvaluated
  };
}

function simulateRootChoices(
  context: BattlePolicyContext,
  choices: BattleChoice[],
  config: MinimaxPolicyConfig,
  search: SearchState
): SimulatedRoot[] {
  const roots: SimulatedRoot[] = [];
  const evaluator = context.evaluator ?? evaluateBattleState;
  const perspective = context.perspective ?? "nemesis";
  for (const choice of orderChoices(choices, context.seed, "max").slice(0, config.maxLegalChoices)) {
    if (!canSearch(search, config)) break;
    const snapshot = context.simulateChoice?.(choice);
    search.nodesEvaluated += 1;
    if (!snapshot) continue;
    roots.push({choice, snapshot, score: evaluator(snapshot, perspective)});
  }

  return roots
    .sort((left, right) => {
      const terminal = terminalRank(right.snapshot) - terminalRank(left.snapshot);
      if (terminal !== 0) return terminal;
      const score = right.score - left.score;
      if (score !== 0) return score;
      return tieBreak(context.seed, right.choice.id) - tieBreak(context.seed, left.choice.id);
    })
    .slice(0, config.maxLegalChoices);
}

function evaluateRootChoice(
  context: BattlePolicyContext,
  root: SimulatedRoot,
  config: MinimaxPolicyConfig,
  search: SearchState,
  alpha: number,
  beta: number
): {score: number; complete: boolean} {
  if (config.depth <= 1 || root.snapshot.ended || !context.simulateUserChoice) {
    return {score: root.score, complete: true};
  }

  const userChoices = enabledChoices(root.snapshot.choices);
  if (!userChoices.length) return {score: root.score, complete: true};

  let worstScore = Number.POSITIVE_INFINITY;
  let completedChildren = 0;
  let childBeta = beta;
  const evaluator = context.evaluator ?? evaluateBattleState;
  const perspective = context.perspective ?? "nemesis";

  for (const userChoice of orderChoices(userChoices, `${context.seed}:${root.choice.id}`, "min").slice(0, config.maxLegalChoices)) {
    if (!canSearch(search, config)) return {score: worstScore, complete: false};

    const snapshot = context.simulateUserChoice(root.choice, userChoice);
    search.nodesEvaluated += 1;
    if (!snapshot) continue;

    completedChildren += 1;
    const score = evaluator(snapshot, perspective) - tieBreak(context.seed, `${root.choice.id}:${userChoice.id}`);
    worstScore = Math.min(worstScore, score);
    childBeta = Math.min(childBeta, worstScore);
    if (childBeta <= alpha) break;
  }

  return completedChildren > 0 ? {score: worstScore, complete: true} : {score: root.score, complete: true};
}

function orderChoices(choices: BattleChoice[], seed: string, mode: "max" | "min"): BattleChoice[] {
  return choices
    .slice()
    .sort((left, right) => {
      const kindScore = choiceKindScore(right) - choiceKindScore(left);
      if (kindScore !== 0) return mode === "max" ? kindScore : -kindScore;
      const seeded = tieBreak(seed, right.id) - tieBreak(seed, left.id);
      return mode === "max" ? seeded : -seeded;
    });
}

function choiceKindScore(choice: BattleChoice): number {
  return choice.kind === "move" ? 1 : 0;
}

function terminalRank(snapshot: BattleSnapshot): number {
  if (!snapshot.ended) return 0;
  if (snapshot.winner === "nemesis") return 2;
  if (snapshot.winner === "user") return -2;
  return -1;
}

function canSearch(search: SearchState, config: MinimaxPolicyConfig): boolean {
  if (search.nodesEvaluated >= config.nodeBudget) {
    search.budgetHit = true;
    return false;
  }
  if (Date.now() - search.startedAt > config.timeBudgetMs) {
    search.budgetHit = true;
    return false;
  }
  return true;
}

function fallbackDecision(context: BattlePolicyContext, nodesEvaluated: number, reason: string): BattleDecision {
  const greedy = greedyPolicy.choose(context);
  if (greedy.choice) return {...greedy, reason, nodesEvaluated: nodesEvaluated + (greedy.nodesEvaluated ?? 0)};

  const basic = basicPolicy.choose(context);
  if (basic.choice) return {...basic, reason: "basic fallback", nodesEvaluated: nodesEvaluated + (basic.nodesEvaluated ?? 0)};

  return {reason, nodesEvaluated};
}

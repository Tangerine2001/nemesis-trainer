import {basicPolicy} from "@/lib/battle-ai/basic-policy";
import {createEvaluator} from "@/lib/battle-ai/evaluate";
import {greedyPolicy} from "@/lib/battle-ai/greedy-policy";
import {createMinimaxPolicy} from "@/lib/battle-ai/minimax-policy";
import type {ArenaAgentVariant, ArenaSerializableVariant} from "@/lib/battle-ai/arena/types";

const ARENA_MINIMAX_CONFIG = {depth: 2, nodeBudget: 40, timeBudgetMs: 100, maxLegalChoices: 4};

export function createArenaVariant(config: ArenaSerializableVariant): ArenaAgentVariant {
  const evaluator = config.weights ? createEvaluator(config.weights) : undefined;
  const policy =
    config.kind === "basic"
      ? basicPolicy
      : config.kind === "greedy"
        ? greedyPolicy
        : createMinimaxPolicy(config.minimaxConfig ?? ARENA_MINIMAX_CONFIG);

  return {
    id: config.id,
    label: config.id,
    policy,
    evaluator,
    weights: config.weights
  };
}

export function defaultArenaVariants(): ArenaSerializableVariant[] {
  return [
    {id: "basic", kind: "basic"},
    {id: "greedy", kind: "greedy"},
    {id: "minimax-default", kind: "minimax"}
  ];
}

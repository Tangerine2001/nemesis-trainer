import type {BattlePolicy} from "@/lib/battle-ai/policy";
import type {BattleEvaluator, EvaluationWeights} from "@/lib/battle-ai/evaluate";
import type {MinimaxPolicyConfig} from "@/lib/battle-ai/minimax-policy";

export type ArenaSide = "p1" | "p2";
export type ArenaAgentId = "agentA" | "agentB";
export type ArenaGameWinner = ArenaAgentId | "tie";
export type ArenaMatchResult = ArenaAgentId | "shared-win-tie";

export interface ArenaTeam {
  id: string;
  name: string;
  sourcePath: string;
  packed: string;
}

export interface ArenaAgentVariant {
  id: string;
  label: string;
  policy: BattlePolicy;
  evaluator?: BattleEvaluator;
  weights?: EvaluationWeights;
}

export interface ArenaGameAgent {
  id: ArenaAgentId;
  variant: ArenaAgentVariant;
  side: ArenaSide;
  teamId: string;
}

export interface ArenaChoiceRecord {
  side: ArenaSide;
  choice: string;
  turn: number;
  reason?: string;
  fallback?: boolean;
}

export interface ArenaGameResult {
  id: string;
  seed: string;
  winner: ArenaGameWinner;
  turns: number;
  fallbackChoices: number;
  errors: string[];
  perf?: ArenaPerfStats;
  agents: ArenaGameAgent[];
  choices: ArenaChoiceRecord[];
  final: {
    agentA: ArenaQualitySnapshot;
    agentB: ArenaQualitySnapshot;
  };
}

export interface ArenaQualitySnapshot {
  remainingPokemon: number;
  hpFraction: number;
}

export interface ArenaPerfStats {
  elapsedMs: number;
  replays: number;
  replayCacheHits: number;
  snapshots: number;
  choiceBuilds: number;
}

export interface ArenaSwapPairResult {
  id: string;
  teamA: string;
  teamB: string;
  games: [ArenaGameResult, ArenaGameResult];
  winner?: ArenaAgentId;
}

export interface ArenaMatchTask {
  id: string;
  seed: string;
  agentA: ArenaSerializableVariant;
  agentB: ArenaSerializableVariant;
  maxPairs: number;
  maxTurns: number;
}

export interface ArenaSerializableVariant {
  id: string;
  kind: "basic" | "greedy" | "minimax";
  weights?: EvaluationWeights;
  minimaxConfig?: Partial<MinimaxPolicyConfig>;
}

export interface ArenaMatchResultSummary {
  id: string;
  seed: string;
  agentA: ArenaSerializableVariant;
  agentB: ArenaSerializableVariant;
  result: ArenaMatchResult;
  pairs: ArenaSwapPairResult[];
  fitness: Record<ArenaAgentId, number>;
  perf?: ArenaPerfStats;
}

export interface ArenaRunReport {
  seed: string;
  createdAt: string;
  options: Record<string, string | number>;
  teams: Array<{id: string; name: string}>;
  variants: ArenaSerializableVariant[];
  matches: ArenaMatchResultSummary[];
  standings: Array<{
    id: string;
    matches: number;
    doubleSideWins: number;
    sharedWins: number;
    losses: number;
    fitness: number;
  }>;
}

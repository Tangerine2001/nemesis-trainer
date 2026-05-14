import {createRng} from "@/lib/boss-generator/random";
import {runArenaGame} from "@/lib/battle-ai/arena/battle-runner";
import {scoreMatchFitness} from "@/lib/battle-ai/arena/fitness";
import {createArenaVariant} from "@/lib/battle-ai/arena/variant";
import type {
  ArenaAgentId,
  ArenaPerfStats,
  ArenaMatchResultSummary,
  ArenaMatchTask,
  ArenaSwapPairResult,
  ArenaTeam
} from "@/lib/battle-ai/arena/types";

export function runSwapMatch(task: ArenaMatchTask, teams: ArenaTeam[]): ArenaMatchResultSummary {
  const agentA = createArenaVariant(task.agentA);
  const agentB = createArenaVariant(task.agentB);
  const pairs: ArenaSwapPairResult[] = [];
  let result: ArenaMatchResultSummary["result"] = "shared-win-tie";

  for (let pairIndex = 0; pairIndex < task.maxPairs; pairIndex += 1) {
    const [teamA, teamB] = pickTeamPair(teams, `${task.seed}:pair:${pairIndex}`);
    const first = runArenaGame({
      id: `${task.id}:pair-${pairIndex}:game-1`,
      seed: `${task.seed}:pair-${pairIndex}:game-1`,
      p1: {agent: "agentA", variant: agentA, team: teamA},
      p2: {agent: "agentB", variant: agentB, team: teamB},
      maxTurns: task.maxTurns
    });
    const second = runArenaGame({
      id: `${task.id}:pair-${pairIndex}:game-2`,
      seed: `${task.seed}:pair-${pairIndex}:game-2`,
      p1: {agent: "agentB", variant: agentB, team: teamA},
      p2: {agent: "agentA", variant: agentA, team: teamB},
      maxTurns: task.maxTurns
    });

    const pairWinner = resolveSwapPairWinner(first.winner, second.winner);
    const pair: ArenaSwapPairResult = {id: `${task.id}:pair-${pairIndex}`, teamA: teamA.id, teamB: teamB.id, games: [first, second]};
    if (pairWinner) pair.winner = pairWinner;
    pairs.push(pair);

    if (pairWinner) {
      result = pairWinner;
      break;
    }
  }

  const withoutFitness = {id: task.id, seed: task.seed, agentA: task.agentA, agentB: task.agentB, result, pairs};
  return {...withoutFitness, fitness: scoreMatchFitness(withoutFitness), perf: perfForPairs(pairs)};
}

export function resolveSwapPairWinner(first: ArenaGameResultWinner, second: ArenaGameResultWinner): ArenaAgentId | undefined {
  return first !== "tie" && first === second ? first : undefined;
}

type ArenaGameResultWinner = ArenaAgentId | "tie";

function pickTeamPair(teams: ArenaTeam[], seed: string): [ArenaTeam, ArenaTeam] {
  const rng = createRng(seed);
  const first = teams[Math.floor(rng() * teams.length)] ?? teams[0];
  let second = teams[Math.floor(rng() * teams.length)] ?? teams[1] ?? teams[0];
  if (teams.length > 1) {
    let guard = 0;
    while (second.id === first.id && guard < 12) {
      second = teams[Math.floor(rng() * teams.length)] ?? teams[1] ?? teams[0];
      guard += 1;
    }
    if (second.id === first.id) second = teams.find((team) => team.id !== first.id) ?? second;
  }
  return [first, second];
}

function perfForPairs(pairs: ArenaSwapPairResult[]): ArenaPerfStats {
  return pairs
    .flatMap((pair) => pair.games)
    .reduce<ArenaPerfStats>(
      (total, game) => ({
        elapsedMs: total.elapsedMs + (game.perf?.elapsedMs ?? 0),
        replays: total.replays + (game.perf?.replays ?? 0),
        replayCacheHits: total.replayCacheHits + (game.perf?.replayCacheHits ?? 0),
        snapshots: total.snapshots + (game.perf?.snapshots ?? 0),
        choiceBuilds: total.choiceBuilds + (game.perf?.choiceBuilds ?? 0)
      }),
      {elapsedMs: 0, replays: 0, replayCacheHits: 0, snapshots: 0, choiceBuilds: 0}
    );
}

import {describe, expect, it} from "vitest";
import {evaluateBattleState} from "@/lib/battle-ai/evaluate";
import {buildArenaChoicesForTest, buildArenaSideViewForTest, qualityForArenaRequestForTest} from "@/lib/battle-ai/arena/battle-runner";
import {resolveSwapPairWinner} from "@/lib/battle-ai/arena/match-runner";
import {createArenaTasks} from "@/lib/battle-ai/arena/report";
import {loadArenaTeams} from "@/lib/battle-ai/arena/team-pool";
import {runMatchTasks} from "@/lib/battle-ai/arena/worker-pool";
import {crossoverGenomes, initialPopulation, mutateGenome} from "@/lib/battle-ai/evolution/genome";
import {
  createEliteDefenseMatchTasks,
  createIncumbentDefenseMatchTasks,
  createTargetMatchTasks,
  scorePeerPopulation
} from "@/lib/battle-ai/evolution/target-training";
import type {AiRequest} from "@/lib/battle-ai/policy";
import type {ArenaGameResult, ArenaMatchResultSummary, ArenaSerializableVariant} from "@/lib/battle-ai/arena/types";
import type {BattleSnapshot} from "@/lib/types";

describe("AI arena", () => {
  it("requires an agent to win both swapped games", () => {
    expect(resolveSwapPairWinner("agentA", "agentA")).toBe("agentA");
    expect(resolveSwapPairWinner("agentA", "agentB")).toBeUndefined();
    expect(resolveSwapPairWinner("tie", "agentA")).toBeUndefined();
  });

  it("loads and validates the curated team pool", () => {
    const teams = loadArenaTeams();
    expect(teams).toHaveLength(10);
    expect(teams.every((team) => team.packed.length > 0)).toBe(true);
  });

  it("builds deterministic arena tasks", () => {
    const variants: ArenaSerializableVariant[] = [
      {id: "one", kind: "basic"},
      {id: "two", kind: "greedy"},
      {id: "three", kind: "minimax"}
    ];

    const first = createArenaTasks({seed: "tasks", rounds: 2, variants, maxPairs: 5, maxTurns: 120});
    const second = createArenaTasks({seed: "tasks", rounds: 2, variants, maxPairs: 5, maxTurns: 120});

    expect(first.map((task) => task.id)).toEqual(second.map((task) => task.id));
    expect(first).toHaveLength(6);
  });

  it("keeps serial and parallel arena execution result ordering stable", async () => {
    const teams = loadArenaTeams();
    const variants: ArenaSerializableVariant[] = [
      {id: "basic", kind: "basic"},
      {id: "greedy", kind: "greedy"}
    ];
    const tasks = createArenaTasks({seed: "parallel-test", rounds: 1, variants, maxPairs: 1, maxTurns: 4});

    const serial = await runMatchTasks(tasks, teams, 1);
    const parallel = await runMatchTasks(tasks, teams, 2);

    expect(parallel.map((match) => match.id)).toEqual(serial.map((match) => match.id));
    expect(parallel.map((match) => match.result)).toEqual(serial.map((match) => match.result));
  });

  it("normalizes arena request data without changing legal choices or side quality", () => {
    const request = arenaRequestFixture();
    const choices = buildArenaChoicesForTest(request);
    const side = buildArenaSideViewForTest(request);
    const quality = qualityForArenaRequestForTest(request);

    expect(choices.map((choice) => choice.id)).toEqual(["move 1", "move 2", "move 3", "switch 3"]);
    expect(choices.find((choice) => choice.id === "move 2")?.disabled).toBe(true);
    expect(side.pokemon.map((pokemon) => pokemon.species)).toEqual(["Great Tusk", "Dragapult", "Kingambit"]);
    expect(side.pokemon[1]).toMatchObject({fainted: true, condition: "0 fnt"});
    expect(quality.remainingPokemon).toBe(2);
    expect(quality.hpFraction).toBeCloseTo(1.4);
  });

  it("records arena performance counters on match results", async () => {
    const teams = loadArenaTeams();
    const variants: ArenaSerializableVariant[] = [
      {id: "basic", kind: "basic"},
      {id: "greedy", kind: "greedy"}
    ];
    const [task] = createArenaTasks({seed: "perf-test", rounds: 1, variants, maxPairs: 1, maxTurns: 4});
    const [match] = await runMatchTasks([task], teams, 1);

    expect(match.perf?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(match.perf?.snapshots).toBeGreaterThan(0);
    expect(match.perf?.choiceBuilds).toBeGreaterThan(0);
  });
});

describe("heuristic evolution", () => {
  it("keeps default evaluator scores unchanged without custom weights", () => {
    const snapshot = battleFixture();
    expect(evaluateBattleState(snapshot, "user")).toBeGreaterThan(250);
  });

  it("mutates genomes deterministically from a seed", () => {
    const [base] = initialPopulation("genome-seed", 1);
    expect(mutateGenome(base, "mutation-seed", 0.9, "mutated")).toEqual(mutateGenome(base, "mutation-seed", 0.9, "mutated"));
  });

  it("crosses genomes while keeping bounded weight values", () => {
    const [left, right] = initialPopulation("crossover-seed", 2);
    const child = crossoverGenomes(left, right, "child-seed", "child");

    expect(child.weights.alive).toBeGreaterThanOrEqual(50);
    expect(child.weights.alive).toBeLessThanOrEqual(450);
    expect(child.weights.totalHp).toBeGreaterThanOrEqual(20);
    expect(child.weights.activeHp).toBeGreaterThanOrEqual(0);
  });
});

describe("targeted AI training", () => {
  it("builds deterministic candidate-vs-candidate target tasks", () => {
    const genomes = initialPopulation("target-task-seed", 4);
    const first = createTargetMatchTasks({seed: "target", genomes, challenges: 3, maxTurns: 12});
    const second = createTargetMatchTasks({seed: "target", genomes, challenges: 3, maxTurns: 12});

    expect(first).toEqual(second);
    expect(first).toHaveLength(6);
    expect(first.every((task) => task.agentA.kind === "minimax" && task.agentB.kind === "minimax")).toBe(true);
    expect(first.every((task) => task.agentA.id !== task.agentB.id)).toBe(true);
    expect(first.every((task) => task.maxPairs === 1)).toBe(true);
  });

  it("builds direct incumbent-defense peer matches", () => {
    const genomes = initialPopulation("incumbent-seed", 4);
    const [incumbent, ...challengers] = genomes;
    const tasks = createIncumbentDefenseMatchTasks({seed: "incumbent", incumbent, challengers, maxTurns: 12});

    expect(tasks).toHaveLength(3);
    expect(tasks.every((task) => task.agentA.id === incumbent.id || task.agentB.id === incumbent.id)).toBe(true);
    expect(tasks.every((task) => task.agentA.id !== task.agentB.id)).toBe(true);
  });

  it("builds capped elite-defense peer matches", () => {
    const genomes = initialPopulation("elite-seed", 6);
    const elites = genomes.slice(0, 2);
    const challengers = genomes.slice(2);
    const first = createEliteDefenseMatchTasks({seed: "elite", elites, challengers, maxTurns: 12, maxMatches: 3});
    const second = createEliteDefenseMatchTasks({seed: "elite", elites, challengers, maxTurns: 12, maxMatches: 3});

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.every((task) => elites.some((elite) => task.agentA.id === elite.id || task.agentB.id === elite.id))).toBe(true);
    expect(first.every((task) => task.agentA.id !== task.agentB.id)).toBe(true);
  });

  it("scores peer candidates by match wins and game wins", () => {
    const genomes = initialPopulation("peer-score-seed", 2);
    const [left, right] = genomes;
    const matches = [
      peerMatch("left-win", left.id, right.id, "agentA", ["agentA", "agentA"]),
      peerMatch("right-split", left.id, right.id, "shared-win-tie", ["agentB", "agentA"]),
      peerMatch("right-win", right.id, left.id, "agentA", ["agentA", "agentA"])
    ];
    const scored = scorePeerPopulation(genomes, matches);
    const leftScore = scored.find((entry) => entry.genome.id === left.id)?.score;
    const rightScore = scored.find((entry) => entry.genome.id === right.id)?.score;

    expect(leftScore).toMatchObject({
      matches: 3,
      doubleSideWins: 1,
      sharedTies: 1,
      losses: 1,
      gameWins: 3,
      gameLosses: 3,
      decisiveGameWins: 3,
      splitPairs: 1
    });
    expect(rightScore).toMatchObject({
      matches: 3,
      doubleSideWins: 1,
      sharedTies: 1,
      losses: 1,
      gameWins: 3,
      gameLosses: 3,
      decisiveGameWins: 3,
      splitPairs: 1
    });
    expect(leftScore?.scoreBreakdown.total).toBe(leftScore?.fitness);
    expect(scored[0].score.fitness).toBeGreaterThan(0);
  });

  it("ranks double-side wins above split-pair performance", () => {
    const genomes = initialPopulation("double-rank-seed", 3);
    const [doubleWinner, splitWinner, opponent] = genomes;
    const scored = scorePeerPopulation(genomes, [
      peerMatch("double", doubleWinner.id, opponent.id, "agentA", ["agentA", "agentA"]),
      peerMatch("split", splitWinner.id, opponent.id, "shared-win-tie", ["agentA", "agentB"])
    ]);

    expect(scored[0].genome.id).toBe(doubleWinner.id);
    expect(scored.find((entry) => entry.genome.id === doubleWinner.id)?.score.doubleSideWins).toBe(1);
    expect(scored.find((entry) => entry.genome.id === splitWinner.id)?.score.splitPairs).toBe(1);
  });

  it("scores split pairs above max-turn ties when no double-side wins exist", () => {
    const genomes = initialPopulation("split-rank-seed", 3);
    const [splitCandidate, maxTurnCandidate, opponent] = genomes;
    const scored = scorePeerPopulation(genomes, [
      peerMatch("split", splitCandidate.id, opponent.id, "shared-win-tie", ["agentA", "agentB"]),
      peerMatch("max-turn", maxTurnCandidate.id, opponent.id, "shared-win-tie", ["tie", "tie"], {maxTurnTie: true})
    ]);

    expect(scored.findIndex((entry) => entry.genome.id === splitCandidate.id)).toBeLessThan(
      scored.findIndex((entry) => entry.genome.id === maxTurnCandidate.id)
    );
    expect(scored.find((entry) => entry.genome.id === maxTurnCandidate.id)?.score.maxTurnTies).toBe(2);
  });
});

function battleFixture(): BattleSnapshot {
  return {
    turn: 1,
    ended: false,
    log: [],
    user: {
      name: "You",
      pokemon: [
        {ident: "p1: Dragapult", species: "Dragapult", condition: "100/100", active: true, fainted: false, moves: []},
        {ident: "p1: Kingambit", species: "Kingambit", condition: "100/100", active: false, fainted: false, moves: []}
      ]
    },
    opponent: {
      name: "Nemesis",
      pokemon: [
        {ident: "p2: Gholdengo", species: "Gholdengo", condition: "20/100 par", active: true, fainted: false, moves: []},
        {ident: "p2: Dragonite", species: "Dragonite", condition: "0 fnt", active: false, fainted: true, moves: []}
      ]
    },
    choices: [],
    errors: []
  };
}

function arenaRequestFixture(): AiRequest {
  return {
    side: {
      name: "Agent A",
      id: "p1",
      pokemon: [
        {
          ident: "p1: Great Tusk",
          details: "Great Tusk, L83",
          condition: "40/100 par",
          active: true,
          item: "heavydutyboots",
          ability: "protosynthesis",
          teraType: "Water",
          moves: ["headlongrush", "rapidspin", "knockoff", "stealthrock"]
        },
        {
          ident: "p1: Dragapult",
          details: "Dragapult, L84",
          condition: "0 fnt",
          moves: ["shadowball"]
        },
        {
          ident: "p1: Kingambit",
          details: "Kingambit, L83",
          condition: "100/100",
          moves: ["kowtowcleave"]
        }
      ]
    },
    active: [
      {
        trapped: false,
        moves: [
          {move: "Headlong Rush", id: "headlongrush", pp: 8, maxpp: 8, target: "normal"},
          {move: "Rapid Spin", id: "rapidspin", pp: 0, maxpp: 64, target: "normal"},
          {move: "Knock Off", id: "knockoff", pp: 32, maxpp: 32, target: "normal"}
        ]
      }
    ]
  };
}

function peerMatch(
  id: string,
  agentAId: string,
  agentBId: string,
  result: ArenaMatchResultSummary["result"],
  gameWinners: Array<"agentA" | "agentB" | "tie">,
  options: {maxTurnTie?: boolean} = {}
): ArenaMatchResultSummary {
  return {
    id,
    seed: id,
    agentA: {id: agentAId, kind: "minimax"},
    agentB: {id: agentBId, kind: "minimax"},
    result,
    pairs: [
      {
        id: `${id}:pair`,
        teamA: "team-a",
        teamB: "team-b",
        games: [peerGame(id, 0, gameWinners[0], options), peerGame(id, 1, gameWinners[1], options)]
      }
    ],
    fitness: {agentA: result === "agentA" ? 1000 : 250, agentB: result === "agentB" ? 1000 : 250}
  };
}

function peerGame(id: string, index: number, winner: ArenaGameResult["winner"], options: {maxTurnTie?: boolean} = {}): ArenaGameResult {
  return {
    id: `${id}:game-${index}`,
    seed: `${id}:game-${index}`,
    winner,
    turns: options.maxTurnTie ? 51 : 10,
    fallbackChoices: 0,
    errors: options.maxTurnTie ? ["Reached max turn limit 50."] : [],
    agents: [],
    choices: [],
    final: {
      agentA: {remainingPokemon: winner === "agentA" ? 3 : 2, hpFraction: winner === "agentA" ? 2.5 : 1.2},
      agentB: {remainingPokemon: winner === "agentB" ? 3 : 2, hpFraction: winner === "agentB" ? 2.5 : 1.2}
    }
  };
}

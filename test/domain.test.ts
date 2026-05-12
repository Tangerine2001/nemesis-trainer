import {describe, expect, it} from "vitest";
import {chooseBasicBattleAction} from "@/lib/battle-ai/basic-policy";
import {evaluateBattleState} from "@/lib/battle-ai/evaluate";
import {chooseGreedyBattleAction} from "@/lib/battle-ai/greedy-policy";
import {analyzeTeam} from "@/lib/analysis/analyze";
import {createAudit} from "@/lib/nemesis";
import {SAMPLE_TEAM, SLOW_SAMPLE_TEAM} from "@/lib/sample-teams";
import {decodeSharePayload, encodeSharePayload} from "@/lib/share/payload";
import {startBattle, takeBattleTurn} from "@/lib/showdown/battle";
import {packBossTeam, packUserTeam} from "@/lib/showdown/team";
import {parseTeam} from "@/lib/team-parser/parser";
import type {BattleChoice, BattleSnapshot} from "@/lib/types";

describe("team parser", () => {
  it("parses common Showdown export blocks", () => {
    const result = parseTeam(SAMPLE_TEAM);

    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(result.team?.members).toHaveLength(6);
    expect(result.team?.members[0]).toMatchObject({
      species: "Great Tusk",
      item: "Heavy-Duty Boots",
      ability: "Protosynthesis",
      teraType: "Water",
      nature: "Jolly"
    });
    expect(result.team?.members[0].moves).toContain("Rapid Spin");
  });
});

describe("analysis", () => {
  it("detects role and speed information from parsed moves", () => {
    const parsed = parseTeam(SLOW_SAMPLE_TEAM);
    expect(parsed.team).toBeDefined();

    const report = analyzeTeam(parsed.team!);

    expect(report.roles.hazards).toBeGreaterThan(0);
    expect(report.roles.setupAnswers).toBeGreaterThan(0);
    expect(report.speed.maxBaseSpeed).toBeLessThan(90);
  });
});

describe("boss generation", () => {
  it("is deterministic for the same team and seed", () => {
    const first = createAudit({rawTeam: SAMPLE_TEAM, seed: "fixed-seed"});
    const second = createAudit({rawTeam: SAMPLE_TEAM, seed: "fixed-seed"});

    expect(first.boss).toEqual(second.boss);
    expect(first.shareCode).toEqual(second.shareCode);
  });

  it("honors explicit trainer style", () => {
    const audit = createAudit({rawTeam: SAMPLE_TEAM, seed: "fixed-seed", style: "Setup Snowball"});
    expect(audit.boss.style).toBe("Setup Snowball");
  });
});

describe("share payloads", () => {
  it("round-trip team, seed, format, and style", () => {
    const code = encodeSharePayload({
      rawTeam: SAMPLE_TEAM,
      format: "gen9ou",
      seed: "abc",
      style: "Wallbreaker"
    });

    expect(decodeSharePayload(code)).toMatchObject({
      rawTeam: SAMPLE_TEAM,
      format: "gen9ou",
      seed: "abc",
      style: "Wallbreaker"
    });
  });
});

describe("showdown battle integration", () => {
  it("validates user and generated boss teams for gen9ou", () => {
    const audit = createAudit({rawTeam: SAMPLE_TEAM, seed: "battle-seed", style: "Setup Snowball"});

    const user = packUserTeam(audit.team);
    const boss = packBossTeam(audit.boss.roster, audit.format);

    expect(user.problems).toEqual([]);
    expect(boss.problems).toEqual([]);
    expect(user.packed).toContain("Great Tusk");
    expect(boss.packed).toContain("Glimmora");
  });

  it("starts a deterministic Showdown-backed battle with legal choices", async () => {
    const first = await startBattle({rawTeam: SAMPLE_TEAM, seed: "battle-seed", style: "Setup Snowball"});
    const second = await startBattle({rawTeam: SAMPLE_TEAM, seed: "battle-seed", style: "Setup Snowball"});

    expect(first.snapshot.errors).toEqual([]);
    expect(first.aiChoices).toEqual([]);
    expect(first.snapshot.choices.length).toBeGreaterThan(0);
    expect(first.snapshot.choices.every((choice) => choice.id.startsWith("move ") || choice.id.startsWith("switch "))).toBe(true);
    expect(first.snapshot).toEqual(second.snapshot);
  });

  it("advances a turn and rejects illegal choices", async () => {
    const start = await startBattle({rawTeam: SAMPLE_TEAM, seed: "battle-seed", style: "Setup Snowball"});
    const choice = start.snapshot.choices.find((candidate) => !candidate.disabled)?.id;

    expect(choice).toBeDefined();

    const next = await takeBattleTurn({
      rawTeam: SAMPLE_TEAM,
      seed: "battle-seed",
      style: "Setup Snowball",
      userChoices: [],
      aiChoices: start.aiChoices,
      choice: choice!
    });

    expect(next.userChoices).toEqual([choice]);
    expect(next.aiChoices.length).toBeGreaterThan(0);
    expect(next.snapshot.log.length).toBeGreaterThan(start.snapshot.log.length);

    await expect(
      takeBattleTurn({
        rawTeam: SAMPLE_TEAM,
        seed: "battle-seed",
        style: "Setup Snowball",
        userChoices: [],
        aiChoices: [],
        choice: "move 99"
      })
    ).rejects.toThrow(/Illegal battle choice/);
  });

  it("requires recorded AI history when replaying previous user choices", async () => {
    const start = await startBattle({rawTeam: SAMPLE_TEAM, seed: "battle-seed", style: "Setup Snowball"});
    const firstChoice = start.snapshot.choices.find((candidate) => !candidate.disabled)?.id;
    expect(firstChoice).toBeDefined();

    const next = await takeBattleTurn({
      rawTeam: SAMPLE_TEAM,
      seed: "battle-seed",
      style: "Setup Snowball",
      userChoices: [],
      aiChoices: start.aiChoices,
      choice: firstChoice!
    });
    const secondChoice = next.snapshot.choices.find((candidate) => !candidate.disabled)?.id;
    expect(secondChoice).toBeDefined();

    await expect(
      takeBattleTurn({
        rawTeam: SAMPLE_TEAM,
        seed: "battle-seed",
        style: "Setup Snowball",
        userChoices: next.userChoices,
        aiChoices: [],
        choice: secondChoice!
      })
    ).rejects.toThrow(/missing a recorded AI choice/);
  });

  it("records greedy AI choices and rejects client-injected current-turn AI choices", async () => {
    const start = await startBattle({rawTeam: SAMPLE_TEAM, seed: "nemesis-demo", style: "Setup Snowball"});
    const headlongRush = start.snapshot.choices.find((choice) => choice.label === "Headlong Rush");
    expect(headlongRush).toBeDefined();

    await expect(
      takeBattleTurn({
        rawTeam: SAMPLE_TEAM,
        seed: "nemesis-demo",
        style: "Setup Snowball",
        userChoices: start.userChoices,
        aiChoices: [...start.aiChoices, "move 4"],
        choice: headlongRush!.id
      })
    ).rejects.toThrow(/extra recorded AI choices/);

    const afterHeadlongRush = await takeBattleTurn({
      rawTeam: SAMPLE_TEAM,
      seed: "nemesis-demo",
      style: "Setup Snowball",
      userChoices: start.userChoices,
      aiChoices: start.aiChoices,
      choice: headlongRush!.id
    });

    expect(afterHeadlongRush.aiChoices.length).toBeGreaterThan(start.aiChoices.length);
    expect(afterHeadlongRush.snapshot.log.some((entry) => entry.text === "Gholdengo entered the battle.")).toBe(true);
    expect(afterHeadlongRush.snapshot.log.some((entry) => entry.text === "Gholdengo is holding Air Balloon.")).toBe(true);
    expect(afterHeadlongRush.snapshot.log.some((entry) => entry.text === "Gholdengo was immune.")).toBe(true);
    expect(afterHeadlongRush.snapshot.opponent.pokemon.find((pokemon) => pokemon.active)?.species).toBe("Gholdengo");

    const knockOff = afterHeadlongRush.snapshot.choices.find((choice) => choice.label === "Knock Off");
    expect(knockOff).toBeDefined();

    const afterKnockOff = await takeBattleTurn({
      rawTeam: SAMPLE_TEAM,
      seed: "nemesis-demo",
      style: "Setup Snowball",
      userChoices: afterHeadlongRush.userChoices,
      aiChoices: afterHeadlongRush.aiChoices,
      choice: knockOff!.id
    });

    expect(afterKnockOff.snapshot.log.some((entry) => entry.text === "Gholdengo lost Air Balloon.")).toBe(true);
    expect(afterKnockOff.snapshot.log.some((entry) => entry.text === "Gholdengo's Special Attack fell by 1.")).toBe(true);
  });
});

describe("battle AI policies", () => {
  it("scores terminal, alive-count, HP, and status advantages from a snapshot", () => {
    const balanced = battleFixture({
      user: [
        {species: "Dragapult", condition: "100/100", active: true},
        {species: "Kingambit", condition: "100/100"}
      ],
      opponent: [
        {species: "Gholdengo", condition: "100/100", active: true},
        {species: "Dragonite", condition: "100/100"}
      ]
    });
    const advantage = battleFixture({
      user: [
        {species: "Dragapult", condition: "100/100", active: true},
        {species: "Kingambit", condition: "100/100"}
      ],
      opponent: [
        {species: "Gholdengo", condition: "20/100 par", active: true},
        {species: "Dragonite", condition: "0 fnt", fainted: true}
      ]
    });
    const terminal = {...advantage, ended: true, winner: "user" as const};

    expect(evaluateBattleState(balanced, "user")).toBe(0);
    expect(evaluateBattleState(advantage, "user")).toBeGreaterThan(250);
    expect(evaluateBattleState(terminal, "user")).toBe(1_000_000);
    expect(evaluateBattleState(terminal, "nemesis")).toBe(-1_000_000);
  });

  it("keeps the basic policy deterministic for equivalent choices", () => {
    const choices: BattleChoice[] = [
      {id: "move 1", label: "Tackle", kind: "move"},
      {id: "move 2", label: "Thunderbolt", kind: "move"}
    ];
    const context = {
      seed: "policy-seed",
      snapshot: battleFixture({user: [], opponent: []}),
      legalChoices: choices,
      request: {
        side: {id: "p2" as const, name: "Nemesis", pokemon: []},
        active: [
          {
            moves: [
              {move: "Tackle", id: "tackle", pp: 35, maxpp: 35, target: "normal"},
              {move: "Thunderbolt", id: "thunderbolt", pp: 15, maxpp: 15, target: "normal"}
            ]
          }
        ]
      }
    };

    expect(chooseBasicBattleAction(context).choice?.id).toBe("move 2");
    expect(chooseBasicBattleAction(context).choice?.id).toBe("move 2");
  });

  it("uses greedy simulated outcomes when they are available", () => {
    const choices: BattleChoice[] = [
      {id: "move 1", label: "Weak hit", kind: "move"},
      {id: "move 2", label: "Winning hit", kind: "move"}
    ];

    const decision = chooseGreedyBattleAction({
      seed: "greedy-seed",
      snapshot: battleFixture({user: [], opponent: []}),
      legalChoices: choices,
      request: {side: {id: "p2", name: "Nemesis", pokemon: []}},
      simulateChoice: (choice) =>
        choice.id === "move 2"
          ? battleFixture({user: [{species: "Dragapult", condition: "0 fnt", active: true, fainted: true}], opponent: []})
          : battleFixture({user: [{species: "Dragapult", condition: "100/100", active: true}], opponent: []})
    });

    expect(decision.choice?.id).toBe("move 2");
    expect(decision.nodesEvaluated).toBe(2);
  });
});

function battleFixture({
  user,
  opponent
}: {
  user: Array<{species: string; condition: string; active?: boolean; fainted?: boolean}>;
  opponent: Array<{species: string; condition: string; active?: boolean; fainted?: boolean}>;
}): BattleSnapshot {
  return {
    turn: 1,
    ended: false,
    log: [],
    user: {name: "You", pokemon: user.map((pokemon, index) => pokemonFixture(pokemon, index))},
    opponent: {name: "Nemesis", pokemon: opponent.map((pokemon, index) => pokemonFixture(pokemon, index))},
    choices: [],
    errors: []
  };
}

function pokemonFixture(
  pokemon: {species: string; condition: string; active?: boolean; fainted?: boolean},
  index: number
): BattleSnapshot["user"]["pokemon"][number] {
  return {
    ident: `p${index + 1}: ${pokemon.species}`,
    species: pokemon.species,
    condition: pokemon.condition,
    active: Boolean(pokemon.active),
    fainted: pokemon.fainted ?? pokemon.condition.includes("fnt"),
    moves: []
  };
}

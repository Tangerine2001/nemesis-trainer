import {describe, expect, it} from "vitest";
import {chooseBasicBattleAction} from "@/lib/battle-ai/basic-policy";
import {rankBattleChoices} from "@/lib/battle-ai/choice-pruning";
import {evaluateBattleState} from "@/lib/battle-ai/evaluate";
import {chooseGreedyBattleAction} from "@/lib/battle-ai/greedy-policy";
import {chooseMinimaxBattleAction} from "@/lib/battle-ai/minimax-policy";
import {
  completeDraftRosterBlock,
  normalizeChampionsEvs
} from "@/lib/draft-lab/draft-sets";
import {
  createEmptyDraft,
  formatMegaStoneMappings,
  leagueRulesFromDraft,
  megaCandidatesFromTeam,
  normalizeDraft,
  parseMegaStoneMappings
} from "@/frontend/features/team-builder/draft";
import {analyzeTeam} from "@/lib/analysis/analyze";
import {parseDraftRoster, runDraftTest} from "@/lib/draft-lab/draft-runner";
import {createAudit} from "@/lib/nemesis";
import {applyLeagueRules} from "@/lib/rules/league-rules";
import {SAMPLE_TEAM, SLOW_SAMPLE_TEAM} from "@/lib/sample-teams";
import {decodeSharePayload, encodeSharePayload} from "@/lib/share/payload";
import {startBattle, takeBattleTurn} from "@/lib/showdown/battle";
import {applyProtocolLineToState, createBattleProtocolState, sideViewWithProtocolState} from "@/lib/showdown/protocol-state";
import {packBossTeam, packUserTeam} from "@/lib/showdown/team";
import {parseTeam} from "@/lib/team-parser/parser";
import type {BattleChoice, BattleSideCondition, BattleSnapshot} from "@/lib/types";

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

  it("round-trips optional league rules", () => {
    const code = encodeSharePayload({
      rawTeam: SAMPLE_TEAM,
      format: "gen9ou",
      seed: "abc",
      style: "Wallbreaker",
      leagueRules: {
        megaMode: "draft-forced-stones",
        selectedMegaSpecies: "Great Tusk",
        megaStoneBySpecies: {"Great Tusk": "Great Tuskite"}
      }
    });

    expect(decodeSharePayload(code).leagueRules).toMatchObject({
      megaMode: "draft-forced-stones",
      selectedMegaSpecies: "Great Tusk",
      megaStoneBySpecies: {"Great Tusk": "Great Tuskite"}
    });
  });
});

describe("draft league rules", () => {
  it("leaves teams unchanged when draft Mega rules are disabled", () => {
    const parsed = parseTeam(SAMPLE_TEAM);
    expect(parsed.team).toBeDefined();

    const resolved = applyLeagueRules(parsed.team!, {megaMode: "standard"});

    expect(resolved.issues).toEqual([]);
    expect(resolved.team).toBe(parsed.team);
    expect(resolved.team.members[0].lockedItem).toBeUndefined();
  });

  it("forces configured Mega Stones and reports replaced items", () => {
    const parsed = parseTeam(SAMPLE_TEAM);
    expect(parsed.team).toBeDefined();

    const resolved = applyLeagueRules(parsed.team!, {
      megaMode: "draft-forced-stones",
      selectedMegaSpecies: "Great Tusk",
      megaStoneBySpecies: {"Great Tusk": "Great Tuskite", Gholdengo: "Gholdengite"}
    });

    expect(resolved.issues).toContainEqual({
      severity: "warning",
      memberIndex: 0,
      message: "Great Tusk must hold Great Tuskite under draft Mega rules; Heavy-Duty Boots was ignored."
    });
    const greatTusk = resolved.team.members.find((member) => member.species === "Great Tusk");
    const gholdengo = resolved.team.members.find((member) => member.species === "Gholdengo");

    expect(greatTusk).toMatchObject({
      item: "Great Tuskite",
      canMegaEvolve: true,
      mayMegaEvolveThisBattle: true,
      lockedItem: {
        item: "Great Tuskite",
        reason: "mega-stone",
        sourceSpecies: "Great Tusk",
        replacedItem: "Heavy-Duty Boots"
      }
    });
    expect(gholdengo).toMatchObject({
      item: "Gholdengite",
      canMegaEvolve: true,
      mayMegaEvolveThisBattle: false
    });
  });

  it("infers display stones for Mega-prefixed species", () => {
    const parsed = parseTeam(`Mega Delphox
Ability: Blaze
- Psychic`);
    expect(parsed.team).toBeDefined();

    const resolved = applyLeagueRules(parsed.team!, {megaMode: "draft-forced-stones"});

    expect(resolved.team.members[0]).toMatchObject({
      item: "Delphoxite",
      canMegaEvolve: true,
      lockedItem: {item: "Delphoxite", reason: "mega-stone", sourceSpecies: "Delphox"}
    });
  });

  it("rejects a selected Mega that is not item-locked to a Mega Stone", () => {
    expect(() =>
      createAudit({
        rawTeam: SAMPLE_TEAM,
        seed: "fixed-seed",
        leagueRules: {
          megaMode: "draft-forced-stones",
          selectedMegaSpecies: "Gholdengo",
          megaStoneBySpecies: {"Great Tusk": "Great Tuskite"}
        }
      })
    ).toThrow(/Selected Mega "Gholdengo" is not item-locked to a Mega Stone/);
  });

  it("packs resolved forced items instead of raw import items", () => {
    const audit = createAudit({
      rawTeam: SAMPLE_TEAM,
      seed: "fixed-seed",
      leagueRules: {
        megaMode: "draft-forced-stones",
        selectedMegaSpecies: "Great Tusk",
        megaStoneBySpecies: {"Great Tusk": "Leftovers"}
      }
    });

    const user = packUserTeam(audit.team);

    expect(user.sets[0].item).toBe("Leftovers");
    expect(user.sets[0].item).not.toBe("Heavy-Duty Boots");
  });
});

describe("frontend draft league rule helpers", () => {
  it("normalizes draft Mega rules to disabled defaults", () => {
    const draft = normalizeDraft({seed: "abc"});

    expect(draft.leagueRules).toEqual({
      enabled: false,
      selectedMegaSpecies: "",
      megaStoneMappingsText: ""
    });
  });

  it("parses and formats Mega Stone mappings", () => {
    const parsed = parseMegaStoneMappings(" Mega Delphox = Delphoxite \n\nMega Golurk = Golurkite");

    expect(parsed.issues).toEqual([]);
    expect(parsed.mappings).toEqual({
      "Mega Delphox": "Delphoxite",
      "Mega Golurk": "Golurkite"
    });
    expect(formatMegaStoneMappings(parsed.mappings)).toBe("Mega Delphox = Delphoxite\nMega Golurk = Golurkite");
  });

  it("reports malformed Mega Stone mapping lines as warnings", () => {
    const parsed = parseMegaStoneMappings("Mega Delphox Delphoxite\nMega Golurk = ");

    expect(parsed.mappings).toEqual({});
    expect(parsed.issues.map((issue) => issue.message)).toEqual([
      'Mega Stone mapping line 1 must use "Species = Stone".',
      "Mega Stone mapping line 2 is missing a species or stone."
    ]);
  });

  it("extracts Mega candidates from Mega-prefixed names and mappings", () => {
    const rawTeam = `Mega Delphox @ Choice Scarf
Ability: Blaze
- Psychic

Golurk @ Leftovers
Ability: Iron Fist
- Earthquake`;

    expect(megaCandidatesFromTeam(rawTeam, {Golurk: "Golurkite"})).toEqual(["Mega Delphox", "Golurk"]);
  });

  it("builds optional league rules only when enabled", () => {
    const disabled = createEmptyDraft();
    expect(leagueRulesFromDraft(disabled, SAMPLE_TEAM)).toEqual({issues: [], megaCandidates: []});

    const enabled = normalizeDraft({
      ...disabled,
      leagueRules: {
        enabled: true,
        selectedMegaSpecies: "Great Tusk",
        megaStoneMappingsText: "Great Tusk = Great Tuskite"
      }
    });

    expect(leagueRulesFromDraft(enabled, SAMPLE_TEAM)).toMatchObject({
      leagueRules: {
        megaMode: "draft-forced-stones",
        maxMegaEvolutionsPerBattle: 1,
        selectedMegaSpecies: "Great Tusk",
        megaStoneBySpecies: {"Great Tusk": "Great Tuskite"}
      },
      issues: [],
      megaCandidates: ["Great Tusk"]
    });
  });
});

describe("draft battle test runner", () => {
  it("parses plain Pokemon lists as draft rosters", () => {
    const roster = parseDraftRoster("Sneasler\nMega Delphox\nArchaludon, Clefable");

    expect(roster).toEqual([
      {slot: 1, species: "Sneasler", rawBlock: "Sneasler"},
      {slot: 2, species: "Mega Delphox", rawBlock: "Mega Delphox"},
      {slot: 3, species: "Archaludon", rawBlock: "Archaludon"},
      {slot: 4, species: "Clefable", rawBlock: "Clefable"}
    ]);
  });

  it("fills draft roster skeletons with Champions EV caps and no IV lines", () => {
    const completed = completeDraftRosterBlock("Delphox\nIVs: 0 Atk", "gen9ou", "set-seed");
    const parsed = parseTeam(completed.rawBlock);
    const member = parsed.team?.members[0];

    expect(member?.ability).toBeTruthy();
    expect(member?.moves).toHaveLength(4);
    expect(completed.rawBlock).not.toContain("IVs:");
    expect(Math.max(...Object.values(member?.evs ?? {}))).toBeLessThanOrEqual(32);
    expect(Object.values(member?.evs ?? {}).reduce((total, value) => total + value, 0)).toBeLessThanOrEqual(66);
    expect(packUserTeam(parsed.team!).problems).toEqual([]);
  });

  it("normalizes Showdown EV spreads into the Champions budget", () => {
    expect(normalizeChampionsEvs({spa: 252, spd: 4, spe: 252})).toEqual({spa: 32, spd: 2, spe: 32});
  });

  it("parses draft roster members from Showdown blocks", () => {
    const roster = parseDraftRoster(SAMPLE_TEAM);

    expect(roster).toHaveLength(6);
    expect(roster[0]).toMatchObject({slot: 1, species: "Great Tusk"});
    expect(roster[3]).toMatchObject({slot: 4, species: "Gholdengo"});
  });

  it("runs deterministic draft test samples", () => {
    const first = runDraftTest({
      you: {name: "You", rawRoster: SAMPLE_TEAM, fixedLead: "Great Tusk"},
      opponent: {name: "Opponent", rawRoster: SAMPLE_TEAM, fixedLead: "Gholdengo"},
      options: {
        seed: "draft-test-seed",
        runs: 2,
        maxTurns: 1,
        variant: {id: "basic-test", kind: "basic"}
      }
    });
    const second = runDraftTest({
      you: {name: "You", rawRoster: SAMPLE_TEAM, fixedLead: "Great Tusk"},
      opponent: {name: "Opponent", rawRoster: SAMPLE_TEAM, fixedLead: "Gholdengo"},
      options: {
        seed: "draft-test-seed",
        runs: 2,
        maxTurns: 1,
        variant: {id: "basic-test", kind: "basic"}
      }
    });

    expect(first.summary.games).toBe(2);
    expect(first.records.yourLeads[0]).toMatchObject({label: "Great Tusk", games: 2});
    expect(first.runs.map((run) => run.winner)).toEqual(second.runs.map((run) => run.winner));
    expect(first.runs.map((run) => run.yourBring)).toEqual(second.runs.map((run) => run.yourBring));
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
    expect(afterHeadlongRush.snapshot.log.some((entry) => entry.text === "Dragonite entered the battle.")).toBe(true);
    expect(afterHeadlongRush.snapshot.log.some((entry) => entry.text === "Dragonite was immune.")).toBe(true);
    expect(afterHeadlongRush.snapshot.opponent.pokemon.find((pokemon) => pokemon.active)?.species).toBe("Dragonite");
  });

  it("projects Showdown protocol boosts and side conditions into side views", () => {
    const protocol = createBattleProtocolState();
    applyProtocolLineToState(["", "-boost", "p2a: Gholdengo", "spa", "2"], protocol);
    applyProtocolLineToState(["", "-unboost", "p2a: Gholdengo", "spe", "1"], protocol);
    applyProtocolLineToState(["", "-sidestart", "p1: You", "move: Stealth Rock"], protocol);
    applyProtocolLineToState(["", "-sidestart", "p2: Nemesis", "move: Spikes"], protocol);
    applyProtocolLineToState(["", "-sidestart", "p2: Nemesis", "move: Spikes"], protocol);

    const projected = sideViewWithProtocolState(
      {
        name: "Nemesis",
        pokemon: [
          {
            ident: "p2: Gholdengo",
            species: "Gholdengo",
            condition: "100/100",
            active: true,
            fainted: false,
            moves: []
          }
        ]
      },
      "p2",
      protocol
    );

    expect(projected.pokemon[0].boosts).toMatchObject({spa: 2, spe: -1});
    expect(projected.conditions?.find((condition) => condition.id === "spikes")?.layers).toBe(2);
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
        {species: "Dragapult", condition: "100/100", active: true},
        {species: "Kingambit", condition: "100/100"}
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

  it("scores speed and type pressure from known active battle state", () => {
    const speedPressure = battleFixture({
      user: [{species: "Dragapult", condition: "100/100", active: true}],
      opponent: [{species: "Kingambit", condition: "100/100", active: true}]
    });
    const typePressure = battleFixture({
      user: [{species: "Great Tusk", condition: "100/100", active: true, moves: ["Headlong Rush"]}],
      opponent: [{species: "Gholdengo", condition: "100/100", active: true, moves: ["Shadow Ball"]}]
    });

    expect(evaluateBattleState(speedPressure, "user")).toBeGreaterThan(evaluateBattleState(speedPressure, "nemesis"));
    expect(evaluateBattleState(typePressure, "user")).toBeGreaterThan(50);
  });

  it("scores immediate KO pressure and endgame cleanup pressure", () => {
    const noThreat = battleFixture({
      user: [{species: "Dragapult", condition: "100/100", active: true, moves: ["Quick Attack"]}],
      opponent: [{species: "Gholdengo", condition: "25/100", active: true}]
    });
    const koThreat = battleFixture({
      user: [{species: "Dragapult", condition: "100/100", active: true, moves: ["Shadow Ball"]}],
      opponent: [{species: "Gholdengo", condition: "25/100", active: true}]
    });
    const endgamePriority = battleFixture({
      user: [{species: "Kingambit", condition: "100/100", active: true, moves: ["Sucker Punch"]}],
      opponent: [{species: "Dragapult", condition: "25/100", active: true}]
    });

    expect(evaluateBattleState(koThreat, "user")).toBeGreaterThan(evaluateBattleState(noThreat, "user") + 50);
    expect(evaluateBattleState(endgamePriority, "user")).toBeGreaterThan(evaluateBattleState(endgamePriority, "nemesis"));
  });

  it("scores boost stages and side conditions parsed from battle state", () => {
    const neutral = battleFixture({
      user: [{species: "Dragonite", condition: "100/100", active: true}],
      opponent: [{species: "Kingambit", condition: "100/100", active: true}]
    });
    const boosted = battleFixture({
      user: [{species: "Dragonite", condition: "100/100", active: true, boosts: {atk: 2, spe: 1}}],
      opponent: [{species: "Kingambit", condition: "100/100", active: true}]
    });
    const hazardsForUser = battleFixture({
      user: [{species: "Dragonite", condition: "100/100", active: true}],
      opponent: [{species: "Kingambit", condition: "100/100", active: true}],
      opponentConditions: [{id: "stealthrock", label: "Stealth Rock"}]
    });
    const hazardsAgainstUser = battleFixture({
      user: [{species: "Dragonite", condition: "100/100", active: true}],
      opponent: [{species: "Kingambit", condition: "100/100", active: true}],
      userConditions: [{id: "stealthrock", label: "Stealth Rock"}]
    });

    expect(evaluateBattleState(boosted, "user")).toBeGreaterThan(evaluateBattleState(neutral, "user"));
    expect(evaluateBattleState(hazardsForUser, "user")).toBeGreaterThan(evaluateBattleState(hazardsAgainstUser, "user"));
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

  it("uses minimax to take terminal winning outcomes", () => {
    const choices: BattleChoice[] = [
      {id: "move 1", label: "Chip hit", kind: "move"},
      {id: "move 2", label: "Winning hit", kind: "move"}
    ];

    const decision = chooseMinimaxBattleAction(
      {
        seed: "minimax-win",
        snapshot: battleFixture({user: [], opponent: []}),
        legalChoices: choices,
        request: {side: {id: "p2", name: "Nemesis", pokemon: []}},
        simulateChoice: (choice) =>
          choice.id === "move 2"
            ? {...battleFixture({user: [], opponent: []}), ended: true, winner: "nemesis"}
            : battleFixture({user: [{species: "Dragapult", condition: "80/100", active: true}], opponent: []})
      },
      {depth: 2, nodeBudget: 20, timeBudgetMs: 1000}
    );

    expect(decision.choice?.id).toBe("move 2");
    expect(decision.reason).toBe("minimax depth 2");
  });

  it("pre-ranks super effective and priority moves before low-value choices", () => {
    const choices: BattleChoice[] = [
      {id: "move 1", label: "Rapid Spin", kind: "move"},
      {id: "move 2", label: "Headlong Rush", kind: "move"},
      {id: "move 3", label: "Swords Dance", kind: "move"}
    ];
    const ranked = rankBattleChoices({
      choices,
      request: {
        side: {id: "p1", name: "You", pokemon: []},
        active: [
          {
            moves: [
              {move: "Rapid Spin", id: "rapidspin", pp: 64, maxpp: 64, target: "normal"},
              {move: "Headlong Rush", id: "headlongrush", pp: 8, maxpp: 8, target: "normal"},
              {move: "Swords Dance", id: "swordsdance", pp: 32, maxpp: 32, target: "self"}
            ]
          }
        ]
      },
      snapshot: battleFixture({
        user: [{species: "Great Tusk", condition: "100/100", active: true, moves: ["Headlong Rush", "Rapid Spin"]}],
        opponent: [{species: "Gholdengo", condition: "100/100", active: true}]
      }),
      perspective: "user",
      seed: "rank-moves",
      mode: "max"
    });

    expect(ranked[0].label).toBe("Headlong Rush");
  });

  it("uses minimax to avoid immediate user punishments", () => {
    const aiChoices: BattleChoice[] = [
      {id: "move 1", label: "Risky setup", kind: "move"},
      {id: "move 2", label: "Safe attack", kind: "move"}
    ];
    const userChoices: BattleChoice[] = [
      {id: "move 1", label: "Punish", kind: "move"},
      {id: "move 2", label: "Neutral hit", kind: "move"}
    ];
    const rootSnapshot = {...battleFixture({user: [], opponent: []}), choices: userChoices};

    const decision = chooseMinimaxBattleAction(
      {
        seed: "minimax-punish",
        snapshot: battleFixture({user: [], opponent: []}),
        legalChoices: aiChoices,
        request: {side: {id: "p2", name: "Nemesis", pokemon: []}},
        simulateChoice: () => rootSnapshot,
        simulateUserChoice: (aiChoice, userChoice) => {
          if (aiChoice.id === "move 1" && userChoice.id === "move 1") {
            return {...battleFixture({user: [], opponent: []}), ended: true, winner: "user"};
          }
          if (aiChoice.id === "move 2") {
            return battleFixture({
              user: [{species: "Dragapult", condition: "45/100", active: true}],
              opponent: [{species: "Gholdengo", condition: "100/100", active: true}]
            });
          }
          return battleFixture({
            user: [{species: "Dragapult", condition: "100/100", active: true}],
            opponent: [{species: "Gholdengo", condition: "70/100", active: true}]
          });
        }
      },
      {depth: 2, nodeBudget: 20, timeBudgetMs: 1000}
    );

    expect(decision.choice?.id).toBe("move 2");
    expect(decision.nodesEvaluated).toBeGreaterThan(2);
  });

  it("falls back deterministically when minimax cannot complete within budget", () => {
    const choices: BattleChoice[] = [
      {id: "move 1", label: "Weak hit", kind: "move"},
      {id: "move 2", label: "Winning hit", kind: "move"}
    ];
    const userChoices: BattleChoice[] = [{id: "move 1", label: "Reply", kind: "move"}];

    const decision = chooseMinimaxBattleAction(
      {
        seed: "minimax-budget",
        snapshot: battleFixture({user: [], opponent: []}),
        legalChoices: choices,
        request: {side: {id: "p2", name: "Nemesis", pokemon: []}},
        simulateChoice: (choice) =>
          choice.id === "move 2"
            ? {...battleFixture({user: [{species: "Dragapult", condition: "0 fnt", active: true, fainted: true}], opponent: []}), choices: userChoices}
            : {...battleFixture({user: [{species: "Dragapult", condition: "100/100", active: true}], opponent: []}), choices: userChoices},
        simulateUserChoice: () => battleFixture({user: [], opponent: []})
      },
      {depth: 2, nodeBudget: 1, timeBudgetMs: 1000}
    );

    expect(decision.choice?.id).toBe("move 2");
    expect(decision.reason).toBe("minimax budget fallback");
  });
});

function battleFixture({
  user,
  opponent,
  userConditions,
  opponentConditions
}: {
  user: Array<FixturePokemon>;
  opponent: Array<FixturePokemon>;
  userConditions?: BattleSideCondition[];
  opponentConditions?: BattleSideCondition[];
}): BattleSnapshot {
  return {
    turn: 1,
    ended: false,
    log: [],
    user: {name: "You", pokemon: user.map((pokemon, index) => pokemonFixture(pokemon, index)), conditions: userConditions},
    opponent: {name: "Nemesis", pokemon: opponent.map((pokemon, index) => pokemonFixture(pokemon, index)), conditions: opponentConditions},
    choices: [],
    errors: []
  };
}

interface FixturePokemon {
  species: string;
  condition: string;
  active?: boolean;
  fainted?: boolean;
  moves?: string[];
  item?: string;
  ability?: string;
  boosts?: BattleSnapshot["user"]["pokemon"][number]["boosts"];
}

function pokemonFixture(pokemon: FixturePokemon, index: number): BattleSnapshot["user"]["pokemon"][number] {
  return {
    ident: `p${index + 1}: ${pokemon.species}`,
    species: pokemon.species,
    condition: pokemon.condition,
    active: Boolean(pokemon.active),
    fainted: pokemon.fainted ?? pokemon.condition.includes("fnt"),
    item: pokemon.item,
    ability: pokemon.ability,
    moves: pokemon.moves ?? [],
    boosts: pokemon.boosts
  };
}

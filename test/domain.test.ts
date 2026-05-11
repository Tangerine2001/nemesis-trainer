import {describe, expect, it} from "vitest";
import {analyzeTeam} from "@/lib/analysis/analyze";
import {createAudit} from "@/lib/nemesis";
import {SAMPLE_TEAM, SLOW_SAMPLE_TEAM} from "@/lib/sample-teams";
import {decodeSharePayload, encodeSharePayload} from "@/lib/share/payload";
import {startBattle, takeBattleTurn} from "@/lib/showdown/battle";
import {packBossTeam, packUserTeam} from "@/lib/showdown/team";
import {parseTeam} from "@/lib/team-parser/parser";

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
      choice: choice!
    });

    expect(next.userChoices).toEqual([choice]);
    expect(next.snapshot.log.length).toBeGreaterThan(start.snapshot.log.length);

    await expect(
      takeBattleTurn({
        rawTeam: SAMPLE_TEAM,
        seed: "battle-seed",
        style: "Setup Snowball",
        userChoices: [],
        choice: "move 99"
      })
    ).rejects.toThrow(/Illegal battle choice/);
  });
});

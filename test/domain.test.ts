import {describe, expect, it} from "vitest";
import {analyzeTeam} from "@/lib/analysis/analyze";
import {createAudit} from "@/lib/nemesis";
import {SAMPLE_TEAM, SLOW_SAMPLE_TEAM} from "@/lib/sample-teams";
import {decodeSharePayload, encodeSharePayload} from "@/lib/share/payload";
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

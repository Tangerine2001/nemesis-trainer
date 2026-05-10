import {isPokemonType, STAT_ALIASES} from "@/lib/battle-data";
import type {ParseIssue, ParseResult, StatId, SupportedFormat, TeamMember} from "@/lib/types";

const DEFAULT_FORMAT: SupportedFormat = "gen9ou";

export function parseTeam(rawText: string, format: SupportedFormat = DEFAULT_FORMAT): ParseResult {
  const issues: ParseIssue[] = [];
  const cleaned = rawText.replace(/\r\n/g, "\n").trim();

  if (!cleaned) {
    return {issues: [{severity: "error", message: "Paste a Showdown export before analyzing."}]};
  }

  const blocks = cleaned
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length > 6) {
    issues.push({severity: "error", message: "Only teams of up to six members are supported in the MVP."});
  }

  const members = blocks.slice(0, 6).map((block, index) => parseMember(block, index, issues));

  if (members.length === 0) {
    issues.push({severity: "error", message: "No team members could be parsed."});
  }

  if (members.some((member) => member.moves.length === 0)) {
    issues.push({severity: "warning", message: "At least one member has no parsed moves. The audit may miss coverage and role signals."});
  }

  if (issues.some((issue) => issue.severity === "error")) {
    return {issues};
  }

  return {
    team: {
      format,
      members,
      rawText: cleaned
    },
    issues
  };
}

function parseMember(block: string, memberIndex: number, issues: ParseIssue[]): TeamMember {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const header = lines[0] ?? "Unknown";
  const member = parseHeader(header);

  for (const line of lines.slice(1)) {
    if (line.startsWith("- ")) {
      const move = line.slice(2).trim();
      if (move) member.moves.push(move);
      continue;
    }

    if (line.endsWith(" Nature")) {
      member.nature = line.replace(/\s+Nature$/, "");
      continue;
    }

    const [rawKey, ...valueParts] = line.split(":");
    if (valueParts.length === 0) continue;

    const key = rawKey.trim().toLowerCase();
    const value = valueParts.join(":").trim();

    if (key === "ability") member.ability = value;
    if (key === "level") member.level = Number.parseInt(value, 10);
    if (key === "tera type") {
      if (isPokemonType(value)) {
        member.teraType = value;
      } else {
        issues.push({severity: "warning", message: `Unknown Tera Type "${value}" on ${member.species}.`, memberIndex});
      }
    }
    if (key === "evs") member.evs = parseStatSpread(value, memberIndex, "EVs", issues);
    if (key === "ivs") member.ivs = parseStatSpread(value, memberIndex, "IVs", issues);
  }

  return member;
}

function parseHeader(header: string): TeamMember {
  const [identityPart, itemPart] = header.split("@").map((part) => part.trim());
  const parentheticalSpecies = identityPart.match(/^(.*?)\s*\((.*?)\)$/);
  const name = parentheticalSpecies?.[1]?.trim() || identityPart.trim();
  const species = parentheticalSpecies?.[2]?.trim() || identityPart.trim();

  return {
    name,
    species,
    item: itemPart || undefined,
    evs: {},
    ivs: {},
    moves: []
  };
}

function parseStatSpread(
  value: string,
  memberIndex: number,
  label: "EVs" | "IVs",
  issues: ParseIssue[]
): Partial<Record<StatId, number>> {
  const spread: Partial<Record<StatId, number>> = {};

  for (const chunk of value.split("/")) {
    const match = chunk.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) {
      issues.push({severity: "warning", message: `Could not parse ${label} chunk "${chunk.trim()}".`, memberIndex});
      continue;
    }

    const amount = Number.parseInt(match[1], 10);
    const stat = STAT_ALIASES[match[2].trim().toLowerCase()];

    if (!stat) {
      issues.push({severity: "warning", message: `Unknown stat "${match[2].trim()}" in ${label}.`, memberIndex});
      continue;
    }

    spread[stat] = amount;
  }

  return spread;
}

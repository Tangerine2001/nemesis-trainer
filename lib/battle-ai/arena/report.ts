import {mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import type {
  ArenaAgentId,
  ArenaRunReport,
  ArenaMatchResultSummary,
  ArenaMatchTask,
  ArenaSerializableVariant,
  ArenaTeam
} from "@/lib/battle-ai/arena/types";

export function createArenaTasks({
  seed,
  rounds,
  variants,
  maxPairs,
  maxTurns
}: {
  seed: string;
  rounds: number;
  variants: ArenaSerializableVariant[];
  maxPairs: number;
  maxTurns: number;
}): ArenaMatchTask[] {
  const tasks: ArenaMatchTask[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (let left = 0; left < variants.length; left += 1) {
      for (let right = left + 1; right < variants.length; right += 1) {
        tasks.push({
          id: `round-${round}:${variants[left].id}:vs:${variants[right].id}`,
          seed: `${seed}:round-${round}:${variants[left].id}:vs:${variants[right].id}`,
          agentA: variants[left],
          agentB: variants[right],
          maxPairs,
          maxTurns
        });
      }
    }
  }
  return tasks;
}

export function createArenaReport({
  seed,
  options,
  teams,
  variants,
  matches
}: {
  seed: string;
  options: Record<string, string | number>;
  teams: ArenaTeam[];
  variants: ArenaSerializableVariant[];
  matches: ArenaMatchResultSummary[];
}): ArenaRunReport {
  return {
    seed,
    createdAt: new Date().toISOString(),
    options,
    teams: teams.map((team) => ({id: team.id, name: team.name})),
    variants,
    matches,
    standings: standings(variants, matches)
  };
}

export function writeArenaReport(report: unknown, prefix: string, seed: string, outputDir = ".arena-runs"): string {
  mkdirSync(outputDir, {recursive: true});
  const safeSeed = seed.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}-${safeSeed}-${prefix}.json`;
  const filePath = path.join(outputDir, filename);
  writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}

function standings(variants: ArenaSerializableVariant[], matches: ArenaMatchResultSummary[]): ArenaRunReport["standings"] {
  const rows = new Map<string, ArenaRunReport["standings"][number]>();
  for (const variant of variants) {
    rows.set(variant.id, {id: variant.id, matches: 0, doubleSideWins: 0, sharedWins: 0, losses: 0, fitness: 0});
  }

  for (const match of matches) {
    addStanding(rows, match.agentA.id, "agentA", match);
    addStanding(rows, match.agentB.id, "agentB", match);
  }

  return [...rows.values()].sort((left, right) => right.fitness - left.fitness || left.id.localeCompare(right.id));
}

function addStanding(rows: Map<string, ArenaRunReport["standings"][number]>, variantId: string, agentId: ArenaAgentId, match: ArenaMatchResultSummary): void {
  const row = rows.get(variantId);
  if (!row) return;
  row.matches += 1;
  row.fitness += match.fitness[agentId];
  if (match.result === "shared-win-tie") {
    row.sharedWins += 1;
  } else if (match.result === agentId) {
    row.doubleSideWins += 1;
  } else {
    row.losses += 1;
  }
}

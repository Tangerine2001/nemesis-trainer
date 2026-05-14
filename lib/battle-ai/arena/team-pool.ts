import {readdirSync, readFileSync} from "node:fs";
import path from "node:path";
import {Teams} from "pokemon-showdown/dist/sim/teams";
import {TeamValidator} from "pokemon-showdown/dist/sim/team-validator";
import type {ArenaTeam} from "@/lib/battle-ai/arena/types";

const DEFAULT_TEAM_DIR = path.join(process.cwd(), "data", "ai-arena", "teams");
const DEFAULT_FORMAT = "gen9ou";

export function loadArenaTeams(teamDir = DEFAULT_TEAM_DIR, format = DEFAULT_FORMAT): ArenaTeam[] {
  const files = readdirSync(teamDir)
    .filter((file) => file.endsWith(".txt"))
    .sort();

  const teams = files.map((file) => loadArenaTeam(path.join(teamDir, file), format));
  if (teams.length < 2) throw new Error("AI arena requires at least two valid team files.");
  return teams;
}

function loadArenaTeam(filePath: string, format: string): ArenaTeam {
  const raw = readFileSync(filePath, "utf8").trim();
  const sets = Teams.import(raw);
  if (!sets?.length) throw new Error(`Could not import arena team ${filePath}.`);

  const problems = TeamValidator.get(format).validateTeam(sets) ?? [];
  if (problems.length) {
    throw new Error(`Invalid arena team ${filePath}:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  }

  const id = path.basename(filePath, ".txt");
  return {
    id,
    name: id
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
    sourcePath: filePath,
    packed: Teams.pack(sets)
  };
}

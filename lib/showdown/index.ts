export {packBossTeam, packUserTeam} from "@/lib/showdown/team";
export {startBattle, takeBattleTurn} from "@/lib/showdown/battle";

import type {Team} from "@/lib/types";

export interface SimulationResult {
  winner: "left" | "right" | "unknown";
  log: string[];
}

export async function simulateBattle(_leftTeam: Team, _rightTeam: Team, _seed: string): Promise<SimulationResult> {
  throw new Error("Showdown simulation is intentionally not wired in the static MVP slice yet.");
}

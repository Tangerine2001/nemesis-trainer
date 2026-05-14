import {readFileSync} from "node:fs";
import {runSwapMatch} from "@/lib/battle-ai/arena/match-runner";
import type {ArenaMatchTask, ArenaTeam} from "@/lib/battle-ai/arena/types";

interface WorkerPayload {
  tasks: ArenaMatchTask[];
  teams: ArenaTeam[];
}

const payload = JSON.parse(readFileSync(0, "utf8")) as WorkerPayload;
const results = payload.tasks.map((task) => runSwapMatch(task, payload.teams));
process.stdout.write(JSON.stringify(results));

import os from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import type {ArenaMatchResultSummary, ArenaMatchTask, ArenaTeam} from "@/lib/battle-ai/arena/types";
import {runSwapMatch} from "@/lib/battle-ai/arena/match-runner";

export function resolveWorkerCount(value: string | number | undefined, taskCount: number): number {
  if (taskCount <= 1) return 1;
  if (value && value !== "auto") return Math.max(1, Math.min(Number(value) || 1, taskCount));
  const available = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(available - 1, 6, taskCount));
}

export async function runMatchTasks(
  tasks: ArenaMatchTask[],
  teams: ArenaTeam[],
  workerCount = resolveWorkerCount("auto", tasks.length)
): Promise<ArenaMatchResultSummary[]> {
  if (workerCount <= 1 || tasks.length <= 1) {
    return tasks.map((task) => runSwapMatch(task, teams)).sort(compareResults);
  }

  const chunks = chunkTasks(tasks, workerCount);
  const results = await Promise.all(chunks.map((chunk) => runWorker(chunk, teams)));
  return results.flat().sort(compareResults);
}

function runWorker(tasks: ArenaMatchTask[], teams: ArenaTeam[]): Promise<ArenaMatchResultSummary[]> {
  return new Promise((resolve, reject) => {
    // Launch through tsx so worker processes use the same TS path alias behavior as the main CLI.
    const worker = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/ai-match-worker.ts"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    worker.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    worker.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    worker.on("error", reject);
    worker.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`AI arena worker exited with code ${code}.\n${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ArenaMatchResultSummary[]);
      } catch (error) {
        reject(new Error(`AI arena worker returned invalid JSON.\n${stderr}\n${String(error)}`));
      }
    });

    worker.stdin.end(JSON.stringify({tasks, teams}));
  });
}

function chunkTasks(tasks: ArenaMatchTask[], workerCount: number): ArenaMatchTask[][] {
  const chunks = Array.from({length: workerCount}, () => [] as ArenaMatchTask[]);
  tasks.forEach((task, index) => chunks[index % workerCount].push(task));
  return chunks.filter((chunk) => chunk.length);
}

function compareResults(left: ArenaMatchResultSummary, right: ArenaMatchResultSummary): number {
  return left.id.localeCompare(right.id);
}

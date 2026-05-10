import {analyzeTeam} from "@/lib/analysis/analyze";
import {generateBossTrainer} from "@/lib/boss-generator/generate";
import {parseTeam} from "@/lib/team-parser/parser";
import type {AuditRequest, AuditResult, SupportedFormat, TrainerStyle} from "@/lib/types";
import {encodeSharePayload} from "@/lib/share/payload";

const DEFAULT_FORMAT: SupportedFormat = "gen9ou";
const DEFAULT_STYLE: TrainerStyle = "auto";

export function createAudit(request: AuditRequest): AuditResult {
  const format = request.format ?? DEFAULT_FORMAT;
  const seed = request.seed?.trim() || "nemesis-demo";
  const style = request.style ?? DEFAULT_STYLE;
  const parsed = parseTeam(request.rawTeam, format);

  if (!parsed.team) {
    throw new Error(parsed.issues.map((issue) => issue.message).join(" "));
  }

  const analysis = analyzeTeam(parsed.team);
  const boss = generateBossTrainer(parsed.team, analysis, seed, style);
  const shareCode = encodeSharePayload({
    format,
    rawTeam: parsed.team.rawText,
    seed,
    style
  });

  return {
    format,
    seed,
    team: parsed.team,
    parseIssues: parsed.issues,
    analysis,
    boss,
    shareCode
  };
}

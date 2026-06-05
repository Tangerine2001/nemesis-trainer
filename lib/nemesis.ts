import {analyzeTeam} from "@/lib/analysis/analyze";
import {generateBossTrainer} from "@/lib/boss-generator/generate";
import {applyLeagueRules} from "@/lib/rules/league-rules";
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

  const resolved = applyLeagueRules(parsed.team, request.leagueRules);
  if (resolved.issues.some((issue) => issue.severity === "error")) {
    throw new Error(resolved.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" "));
  }

  const analysis = analyzeTeam(resolved.team);
  const boss = generateBossTrainer(resolved.team, analysis, seed, style);
  const shareCode = encodeSharePayload({
    format,
    rawTeam: resolved.team.rawText,
    seed,
    style,
    leagueRules: request.leagueRules
  });

  return {
    format,
    seed,
    team: resolved.team,
    parseIssues: [...parsed.issues, ...resolved.issues],
    leagueRuleIssues: resolved.issues,
    analysis,
    boss,
    shareCode
  };
}

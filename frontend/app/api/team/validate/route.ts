import {NextResponse} from "next/server";
import {TeamValidator} from "pokemon-showdown/dist/sim/team-validator";
import {Teams, type PokemonSet} from "pokemon-showdown/dist/sim/teams";

import {draftToShowdownExport, normalizeDraft, validateDraftBasics} from "@/features/team-builder/draft";
import type {TeamDraft} from "@/features/team-builder/types";
import {applyLeagueRules} from "@/lib/rules/league-rules";
import {packUserTeam} from "@/lib/showdown/team";
import {parseTeam} from "@/lib/team-parser/parser";
import type {LeagueRules} from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {draft?: TeamDraft; rawTeam?: string; format?: string; leagueRules?: LeagueRules};
    const format = body.format === "gen9ou" ? body.format : "gen9ou";
    const rawTeam = body.rawTeam ?? (body.draft ? draftToShowdownExport(normalizeDraft(body.draft)) : "");
    const issues = body.draft ? validateDraftBasics(normalizeDraft(body.draft)) : [];

    if (body.leagueRules?.megaMode === "draft-forced-stones") {
      const parsed = parseTeam(rawTeam, format);
      if (!parsed.team) {
        return NextResponse.json({
          ok: false,
          packed: "",
          problems: parsed.issues.map((issue) => issue.message),
          issues
        });
      }

      const resolved = applyLeagueRules(parsed.team, body.leagueRules);
      const packed = packUserTeam(resolved.team);
      const ruleErrors = resolved.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);

      return NextResponse.json({
        ok: packed.problems.length === 0 && ruleErrors.length === 0 && issues.every((issue) => issue.severity !== "error"),
        packed: packed.packed,
        problems: [...ruleErrors, ...packed.problems],
        issues: [...issues, ...resolved.issues]
      });
    }

    const sets = Teams.import(rawTeam);

    if (!rawTeam.trim() || !sets) {
      return NextResponse.json({
        ok: false,
        packed: "",
        problems: ["Add at least one valid Showdown team member."],
        issues
      });
    }

    const problems = TeamValidator.get(format).validateTeam(sets) ?? [];

    return NextResponse.json({
      ok: problems.length === 0 && issues.every((issue) => issue.severity !== "error"),
      packed: problems.length ? "" : Teams.pack(sets as PokemonSet[]),
      problems,
      issues
    });
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Could not validate team."}, {status: 400});
  }
}

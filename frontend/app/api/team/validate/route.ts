import {NextResponse} from "next/server";
import {TeamValidator} from "pokemon-showdown/dist/sim/team-validator";
import {Teams, type PokemonSet} from "pokemon-showdown/dist/sim/teams";

import {draftToShowdownExport, normalizeDraft, validateDraftBasics} from "@/features/team-builder/draft";
import type {TeamDraft} from "@/features/team-builder/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {draft?: TeamDraft; rawTeam?: string; format?: string};
    const format = body.format === "gen9ou" ? body.format : "gen9ou";
    const rawTeam = body.rawTeam ?? (body.draft ? draftToShowdownExport(normalizeDraft(body.draft)) : "");
    const sets = Teams.import(rawTeam);
    const issues = body.draft ? validateDraftBasics(normalizeDraft(body.draft)) : [];

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

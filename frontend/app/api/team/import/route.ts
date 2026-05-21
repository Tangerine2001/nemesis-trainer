import {NextResponse} from "next/server";

import {showdownExportToDraft} from "@/features/team-builder/draft";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {rawTeam?: string};
    const rawTeam = body.rawTeam ?? "";
    const draft = showdownExportToDraft(rawTeam);

    return NextResponse.json({draft});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Could not import team."}, {status: 400});
  }
}

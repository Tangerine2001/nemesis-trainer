import {NextResponse} from "next/server";

import {createAudit} from "@/lib/nemesis";
import type {TrainerStyle} from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {rawTeam?: string; seed?: string; style?: TrainerStyle; format?: "gen9ou"};
    const audit = createAudit({
      rawTeam: body.rawTeam ?? "",
      seed: body.seed,
      style: body.style,
      format: body.format ?? "gen9ou"
    });

    return NextResponse.json({audit});
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "Could not generate audit."}, {status: 400});
  }
}

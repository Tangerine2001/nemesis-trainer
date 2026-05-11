import {NextResponse} from "next/server";
import {startBattle} from "@/lib/showdown/battle";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await startBattle(body);
    const status = response.snapshot.errors.length ? 400 : 200;
    return NextResponse.json(response, {status});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Unable to start battle."},
      {status: 400}
    );
  }
}

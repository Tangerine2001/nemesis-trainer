import {NextResponse} from "next/server";
import {takeBattleTurn} from "@/lib/showdown/battle";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await takeBattleTurn(body);
    const status = response.snapshot.errors.length ? 400 : 200;
    return NextResponse.json(response, {status});
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Unable to advance battle."},
      {status: 400}
    );
  }
}

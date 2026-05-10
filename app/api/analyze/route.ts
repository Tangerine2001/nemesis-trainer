import {NextResponse} from "next/server";
import {createAudit} from "@/lib/nemesis";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const audit = createAudit(body);
    return NextResponse.json(audit);
  } catch (error) {
    return NextResponse.json(
      {error: error instanceof Error ? error.message : "Unable to analyze team."},
      {status: 400}
    );
  }
}

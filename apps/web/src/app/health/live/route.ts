import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "alive",
      timestamp: new Date().toISOString(),
      service: "jules-supervisor-web",
    },
    { status: 200 },
  );
}

import { NextResponse } from "next/server";
import { query } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await query("SELECT 1");
  } catch {
    return NextResponse.json(
      { status: "unhealthy", error: "Database unreachable" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "FreeResend",
    version: "1.0.0",
  });
}

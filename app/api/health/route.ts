import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "still-partners-app",
    checkedAt: new Date().toISOString()
  });
}

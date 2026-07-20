import { NextResponse } from "next/server";
import { clearNotificationAdminSession } from "@/lib/contractor-invoice/push-server";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearNotificationAdminSession(response);
  return response;
}

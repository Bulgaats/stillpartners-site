import { NextResponse } from "next/server";
import {
  getServiceRoleClientOrError,
  setNotificationAdminSession,
  verifyNotificationAdminRequest
} from "@/lib/contractor-invoice/push-server";

type ReactivateRequest = {
  adminName?: string;
  adminPassword?: string;
  subscriptionId?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as ReactivateRequest | null;
  const { admin, error: adminError } = verifyNotificationAdminRequest(request, {
    adminName: payload?.adminName,
    adminPassword: payload?.adminPassword
  });

  if (adminError || !admin) {
    return NextResponse.json({ error: adminError ?? "Invalid admin credentials." }, { status: 401 });
  }

  const subscriptionId = payload?.subscriptionId?.trim();
  if (!subscriptionId) {
    return NextResponse.json({ error: "Notification subscription is required." }, { status: 400 });
  }

  const { supabase, error } = getServiceRoleClientOrError();
  if (!supabase) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("contractor_push_subscriptions")
    .update({
      notification_enabled: true,
      last_seen_at: new Date().toISOString()
    })
    .eq("id", subscriptionId);

  if (updateError) {
    return NextResponse.json({ error: "Notification device could not be reactivated." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  setNotificationAdminSession(response, admin);
  return response;
}

import { NextResponse } from "next/server";
import {
  configureWebPush,
  getServiceRoleClientOrError,
  sendPushToSubscriptions,
  setNotificationAdminSession,
  type StoredPushSubscription,
  verifyNotificationAdminRequest
} from "@/lib/contractor-invoice/push-server";

type SendRequest = {
  adminName?: string;
  adminPassword?: string;
  message?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SendRequest | null;
  const { admin, error: adminError } = verifyNotificationAdminRequest(request, {
    adminName: payload?.adminName,
    adminPassword: payload?.adminPassword
  });
  const message = payload?.message?.trim() ?? "";

  if (adminError || !admin) {
    return NextResponse.json({ error: adminError ?? "Invalid admin credentials." }, { status: 401 });
  }
  if (!message) {
    return NextResponse.json({ error: "Notification message is required." }, { status: 400 });
  }
  if (message.length > 50) {
    return NextResponse.json({ error: "Notification message must be 50 characters or less." }, { status: 400 });
  }

  const vapidError = configureWebPush();
  if (vapidError) {
    return NextResponse.json({ error: vapidError }, { status: 500 });
  }

  const { supabase, error } = getServiceRoleClientOrError();
  if (!supabase) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { data, error: subscriptionsError } = await supabase
    .from("contractor_push_subscriptions")
    .select("id, endpoint, p256dh, auth, display_name, device_label")
    .eq("notification_enabled", true);

  if (subscriptionsError) {
    return NextResponse.json({ error: "Subscriptions could not be loaded." }, { status: 500 });
  }

  const summary = await sendPushToSubscriptions({
    subscriptions: (data ?? []) as StoredPushSubscription[],
    message,
    sentByAdmin: admin.name
  });

  const response = NextResponse.json({
    ok: true,
    sent: summary.sent,
    failed: summary.failed,
    removed: summary.disabled
  });
  setNotificationAdminSession(response, admin);
  return response;
}

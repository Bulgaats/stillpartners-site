import { NextResponse } from "next/server";
import {
  configureWebPush,
  getAdminPasswordError,
  getServiceRoleClientOrError,
  sendPushToSubscriptions,
  type StoredPushSubscription
} from "@/lib/contractor-invoice/push-server";

type SendSelectedRequest = {
  adminPassword?: string;
  message?: string;
  subscriberIds?: string[];
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SendSelectedRequest | null;
  const passwordError = getAdminPasswordError(payload?.adminPassword);
  const message = payload?.message?.trim() ?? "";
  const subscriberIds = Array.isArray(payload?.subscriberIds)
    ? [...new Set(payload.subscriberIds.filter((id) => typeof id === "string" && id.trim()))]
    : [];

  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 401 });
  }
  if (!message) {
    return NextResponse.json({ error: "Notification message is required." }, { status: 400 });
  }
  if (message.length > 50) {
    return NextResponse.json({ error: "Notification message must be 50 characters or less." }, { status: 400 });
  }
  if (subscriberIds.length === 0) {
    return NextResponse.json({ error: "Select at least one notification subscriber." }, { status: 400 });
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
    .in("id", subscriberIds)
    .eq("notification_enabled", true);

  if (subscriptionsError) {
    return NextResponse.json({ error: "Selected notification subscribers could not be loaded." }, { status: 500 });
  }

  const subscriptions = (data ?? []) as StoredPushSubscription[];
  const summary = await sendPushToSubscriptions({ subscriptions, message });

  return NextResponse.json({
    ok: true,
    selected: subscriberIds.length,
    sent: summary.sent,
    failed: summary.failed + Math.max(0, subscriberIds.length - subscriptions.length),
    disabled: summary.disabled
  });
}

import { NextResponse } from "next/server";
import {
  getServiceRoleClientOrError,
  verifyNotificationAdmin
} from "@/lib/contractor-invoice/push-server";

type SubscribersRequest = {
  adminName?: string;
  adminPassword?: string;
};

type SubscriberRow = {
  id: string;
  display_name: string | null;
  device_label: string | null;
  last_seen_at: string | null;
  notification_enabled: boolean | null;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SubscribersRequest | null;
  const { error: adminError } = verifyNotificationAdmin({
    adminName: payload?.adminName,
    adminPassword: payload?.adminPassword
  });

  if (adminError) {
    return NextResponse.json({ error: adminError }, { status: 401 });
  }

  const { supabase, error } = getServiceRoleClientOrError();
  if (!supabase) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { data, error: subscribersError } = await supabase
    .from("contractor_push_subscriptions")
    .select("id, display_name, device_label, last_seen_at, notification_enabled")
    .order("display_name", { ascending: true });

  if (subscribersError) {
    return NextResponse.json({ error: "Notification subscribers could not be loaded." }, { status: 500 });
  }

  const subscribers = ((data ?? []) as SubscriberRow[]).map((subscriber) => ({
    id: subscriber.id,
    display_name: subscriber.display_name?.trim() || "Unnamed contractor",
    device_label: subscriber.device_label,
    last_seen_at: subscriber.last_seen_at,
    notification_enabled: Boolean(subscriber.notification_enabled)
  }));

  return NextResponse.json({ subscribers });
}

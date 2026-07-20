import { NextResponse } from "next/server";
import {
  getServiceRoleClientOrError,
  setNotificationAdminSession,
  verifyNotificationAdminRequest
} from "@/lib/contractor-invoice/push-server";

type SubscribersRequest = {
  adminName?: string;
  adminPassword?: string;
};

type SubscriberRow = {
  id: string;
  display_name: string | null;
  device_label: string | null;
  phone_hash: string | null;
  phone_last4: string | null;
  last_seen_at: string | null;
  notification_enabled: boolean | null;
};

type BaseSubscriberRow = {
  id: string;
  last_seen_at: string | null;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SubscribersRequest | null;
  const { admin, error: adminError } = verifyNotificationAdminRequest(request, {
    adminName: payload?.adminName,
    adminPassword: payload?.adminPassword
  });

  if (adminError || !admin) {
    return NextResponse.json({ error: adminError }, { status: 401 });
  }

  const { supabase, error } = getServiceRoleClientOrError();
  if (!supabase) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { data, error: subscribersError } = await supabase
    .from("contractor_push_subscriptions")
    .select("id, display_name, device_label, phone_hash, phone_last4, last_seen_at, notification_enabled")
    .order("display_name", { ascending: true });

  if (!subscribersError) {
    const subscribers = ((data ?? []) as SubscriberRow[])
      .map(normalizeSubscriber)
      .sort((left, right) => left.display_name.localeCompare(right.display_name));

    return createSubscribersResponse(subscribers, admin);
  }

  const { data: baseData, error: baseError } = await supabase
    .from("contractor_push_subscriptions")
    .select("id, last_seen_at")
    .order("last_seen_at", { ascending: false });

  if (baseError) {
    return NextResponse.json(
      { error: "Notification subscription table could not be loaded. Check the Supabase migration and service role configuration." },
      { status: 500 }
    );
  }

  const subscribers = ((baseData ?? []) as BaseSubscriberRow[]).map((subscriber) => ({
    id: subscriber.id,
    display_name: "Unnamed contractor",
    device_label: null,
    phone_hash: null,
    phone_last4: null,
    last_seen_at: subscriber.last_seen_at,
    notification_enabled: true
  }));

  return createSubscribersResponse(subscribers, admin);
}

function normalizeSubscriber(subscriber: SubscriberRow) {
  return {
    id: subscriber.id,
    display_name: subscriber.display_name?.trim() || "Unnamed contractor",
    device_label: subscriber.device_label,
    phone_hash: subscriber.phone_hash,
    phone_last4: subscriber.phone_last4,
    last_seen_at: subscriber.last_seen_at,
    notification_enabled: subscriber.notification_enabled ?? true
  };
}

function createSubscribersResponse(subscribers: ReturnType<typeof normalizeSubscriber>[], admin: { name: string }) {
  const response = NextResponse.json({
    subscribers,
    admin: {
      name: admin.name
    }
  });
  setNotificationAdminSession(response, admin);
  return response;
}

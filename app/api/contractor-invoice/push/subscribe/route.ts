import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

type PushSubscriptionPayload = {
  endpoint?: string;
  displayName?: string;
  deviceLabel?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;

  if (!payload?.endpoint || !payload.keys?.p256dh || !payload.keys.auth) {
    return NextResponse.json({ error: "Valid push subscription is required." }, { status: 400 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const { error } = await supabase.from("contractor_push_subscriptions").upsert(
    {
      endpoint: payload.endpoint,
      p256dh: payload.keys.p256dh,
      auth: payload.keys.auth,
      display_name: normalizeDisplayName(payload.displayName),
      device_label: normalizeOptionalText(payload.deviceLabel),
      user_agent: request.headers.get("user-agent"),
      last_seen_at: new Date().toISOString(),
      notification_enabled: true
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return NextResponse.json({ error: "Subscription could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function normalizeDisplayName(value: unknown) {
  if (typeof value !== "string") return "Unnamed contractor";
  const trimmed = value.trim();
  return trimmed || "Unnamed contractor";
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

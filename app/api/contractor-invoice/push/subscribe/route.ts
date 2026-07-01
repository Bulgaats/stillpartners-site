import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

type PushSubscriptionPayload = {
  endpoint?: string;
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
      user_agent: request.headers.get("user-agent"),
      last_seen_at: new Date().toISOString()
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    return NextResponse.json({ error: "Subscription could not be saved." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

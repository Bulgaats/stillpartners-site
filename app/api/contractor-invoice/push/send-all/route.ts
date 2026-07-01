import { NextResponse } from "next/server";
import webPush, { type PushSubscription } from "web-push";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

type SendRequest = {
  password?: string;
  message?: string;
};

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as SendRequest | null;
  const password = process.env.CONTRACTOR_INVOICE_ADMIN_PASSWORD;
  const message = payload?.message?.trim() ?? "";

  if (!password || payload?.password !== password) {
    return NextResponse.json({ error: "Incorrect admin password." }, { status: 401 });
  }
  if (!message) {
    return NextResponse.json({ error: "Notification message is required." }, { status: 400 });
  }
  if (message.length > 50) {
    return NextResponse.json({ error: "Notification message must be 50 characters or less." }, { status: 400 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:work@stillpartners.net";

  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "VAPID keys are not configured." }, { status: 500 });
  }

  const supabase = createServiceRoleSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const { data, error } = await supabase
    .from("contractor_push_subscriptions")
    .select("endpoint, p256dh, auth");

  if (error) {
    return NextResponse.json({ error: "Subscriptions could not be loaded." }, { status: 500 });
  }

  const subscriptions = (data ?? []) as StoredSubscription[];
  const staleEndpoints: string[] = [];
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const pushSubscription: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth
        }
      };

      try {
        await webPush.sendNotification(
          pushSubscription,
          JSON.stringify({
            title: "Still Partners",
            body: message,
            url: "/contractor-invoice"
          })
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        if (isGoneError(error)) {
          staleEndpoints.push(subscription.endpoint);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await supabase.from("contractor_push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    removed: staleEndpoints.length
  });
}

function isGoneError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

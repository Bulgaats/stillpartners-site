import webPush, { type PushSubscription } from "web-push";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  display_name: string | null;
  device_label: string | null;
};

export type PushSendSummary = {
  selected: number;
  sent: number;
  failed: number;
  disabled: number;
};

export function getAdminPasswordError(value: unknown) {
  const password = process.env.CONTRACTOR_INVOICE_ADMIN_PASSWORD;

  if (!password || value !== password) {
    return "Incorrect admin password.";
  }

  return null;
}

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:work@stillpartners.net";

  if (!publicKey || !privateKey) {
    return "VAPID keys are not configured.";
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return null;
}

export function getServiceRoleClientOrError() {
  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return { supabase: null, error: "Supabase service role is not configured." };
  }

  return { supabase, error: null };
}

export async function sendPushToSubscriptions({
  subscriptions,
  message
}: {
  subscriptions: StoredPushSubscription[];
  message: string;
}) {
  const { supabase, error } = getServiceRoleClientOrError();
  if (!supabase) {
    throw new Error(error ?? "Supabase service role is not configured.");
  }
  const client = supabase;

  const eventResult = await client
    .from("contractor_notification_events")
    .insert({
      message,
      recipient_count: subscriptions.length
    })
    .select("id")
    .single();
  const eventId = (eventResult.data as { id?: string } | null)?.id;

  let sent = 0;
  let failed = 0;
  let disabled = 0;

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
        await client
          .from("contractor_push_subscriptions")
          .update({
            last_notified_at: new Date().toISOString(),
            notification_enabled: true
          })
          .eq("id", subscription.id);
        await logRecipient({
          eventId,
          subscriptionId: subscription.id,
          displayName: subscription.display_name,
          deliveryStatus: "sent"
        });
      } catch (sendError) {
        if (isGoneError(sendError)) {
          disabled += 1;
          await client
            .from("contractor_push_subscriptions")
            .update({ notification_enabled: false })
            .eq("id", subscription.id);
          await logRecipient({
            eventId,
            subscriptionId: subscription.id,
            displayName: subscription.display_name,
            deliveryStatus: "disabled",
            errorMessage: getErrorMessage(sendError)
          });
          return;
        }

        failed += 1;
        await logRecipient({
          eventId,
          subscriptionId: subscription.id,
          displayName: subscription.display_name,
          deliveryStatus: "failed",
          errorMessage: getErrorMessage(sendError)
        });
      }
    })
  );

  if (eventId) {
    await client
      .from("contractor_notification_events")
      .update({
        sent_count: sent,
        failed_count: failed,
        disabled_count: disabled
      })
      .eq("id", eventId);
  }

  return {
    selected: subscriptions.length,
    sent,
    failed,
    disabled
  } satisfies PushSendSummary;

  async function logRecipient({
    eventId,
    subscriptionId,
    displayName,
    deliveryStatus,
    errorMessage
  }: {
    eventId?: string;
    subscriptionId: string;
    displayName: string | null;
    deliveryStatus: "sent" | "failed" | "disabled";
    errorMessage?: string;
  }) {
    if (!eventId) return;

    await client.from("contractor_notification_event_recipients").insert({
      event_id: eventId,
      subscription_id: subscriptionId,
      display_name: displayName,
      delivery_status: deliveryStatus,
      error_message: errorMessage
    });
  }
}

function isGoneError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

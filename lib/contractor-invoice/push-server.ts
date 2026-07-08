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

export type AdminCredentials = {
  adminName?: string;
  adminPassword?: string;
};

export type VerifiedAdmin = {
  name: string;
};

type ConfiguredAdmin = {
  name: string;
  password: string;
};

export function verifyNotificationAdmin(credentials: AdminCredentials) {
  const adminName = normalizeAdminName(credentials.adminName);
  const adminPassword = credentials.adminPassword ?? "";
  const { admins, error } = getConfiguredAdmins();

  if (error) {
    return { admin: null, error };
  }

  if (!adminName || !adminPassword) {
    return { admin: null, error: "Admin name and password are required." };
  }

  const matchedAdmin = admins.find(
    (admin) => normalizeAdminName(admin.name) === adminName && admin.password === adminPassword
  );

  if (!matchedAdmin) {
    return { admin: null, error: "Invalid admin credentials." };
  }

  return { admin: { name: matchedAdmin.name }, error: null };
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
  message,
  sentByAdmin
}: {
  subscriptions: StoredPushSubscription[];
  message: string;
  sentByAdmin: string;
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
      recipient_count: subscriptions.length,
      sent_by_admin: sentByAdmin
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

function getConfiguredAdmins() {
  const rawAdmins = process.env.CONTRACTOR_INVOICE_ADMINS;
  if (!rawAdmins) {
    return { admins: [], error: "Notification admin credentials are not configured." };
  }

  try {
    const parsed = parseAdminsJson(rawAdmins);
    if (!Array.isArray(parsed)) {
      return { admins: [], error: "Notification admin credentials are not configured correctly." };
    }

    const admins = parsed.filter(isConfiguredAdmin).map((admin) => ({
      name: admin.name.trim(),
      password: admin.password
    }));

    if (admins.length === 0) {
      return { admins: [], error: "Notification admin credentials are not configured correctly." };
    }

    return { admins, error: null };
  } catch {
    return { admins: [], error: "Notification admin credentials are not configured correctly." };
  }
}

function isConfiguredAdmin(value: unknown): value is ConfiguredAdmin {
  if (!value || typeof value !== "object") return false;
  const admin = value as Record<string, unknown>;
  return typeof admin.name === "string" && admin.name.trim().length > 0 && typeof admin.password === "string";
}

function parseAdminsJson(rawAdmins: string) {
  const parsed = JSON.parse(rawAdmins.trim()) as unknown;
  if (typeof parsed === "string") {
    return JSON.parse(parsed.trim()) as unknown;
  }

  return parsed;
}

function normalizeAdminName(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

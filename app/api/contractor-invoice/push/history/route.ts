import { NextResponse } from "next/server";
import {
  getServiceRoleClientOrError,
  setNotificationAdminSession,
  verifyNotificationAdminRequest
} from "@/lib/contractor-invoice/push-server";

type NotificationEventRow = {
  id: string;
  message: string;
  recipient_count: number | null;
  sent_count: number | null;
  failed_count: number | null;
  disabled_count: number | null;
  sent_by_admin: string | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  const { admin, error: adminError } = verifyNotificationAdminRequest(request, {});

  if (adminError || !admin) {
    return NextResponse.json({ error: adminError ?? "Invalid admin credentials." }, { status: 401 });
  }

  const { supabase, error } = getServiceRoleClientOrError();
  if (!supabase) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { data, error: historyError } = await supabase
    .from("contractor_notification_events")
    .select("id, message, recipient_count, sent_count, failed_count, disabled_count, sent_by_admin, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  if (historyError) {
    return NextResponse.json(
      { error: "Notification history could not be loaded. Check the Supabase notification migration." },
      { status: 500 }
    );
  }

  const events = ((data ?? []) as NotificationEventRow[]).map((event) => ({
    id: event.id,
    message: event.message,
    recipient_count: event.recipient_count ?? 0,
    sent_count: event.sent_count ?? 0,
    failed_count: event.failed_count ?? 0,
    disabled_count: event.disabled_count ?? 0,
    sent_by_admin: event.sent_by_admin?.trim() || "Admin",
    created_at: event.created_at
  }));

  const response = NextResponse.json({ events });
  setNotificationAdminSession(response, admin);
  return response;
}

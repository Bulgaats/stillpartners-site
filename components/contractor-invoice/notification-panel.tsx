"use client";

import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import {
  enableContractorNotifications,
  getContractorNotificationState,
  isPushSupported,
  type NotificationStatus
} from "@/lib/contractor-invoice/push";
import {
  getRecentNotifications,
  pruneRecentNotifications,
  type LocalNotificationRecord
} from "@/lib/contractor-invoice/notification-history";

export function NotificationPanel({ displayName }: { displayName?: string }) {
  const [status, setStatus] = useState<NotificationStatus>("idle");
  const [message, setMessage] = useState("");
  const [recentNotifications, setRecentNotifications] = useState<LocalNotificationRecord[]>([]);

  useEffect(() => {
    let active = true;

    async function restoreNotificationState() {
      if (!isPushSupported()) {
        if (active) setStatus("unsupported");
        return;
      }

      const result = await getContractorNotificationState({ displayName });
      if (!active) return;
      setStatus(result.status);
      setMessage(result.message ?? "");
    }

    void restoreNotificationState();

    return () => {
      active = false;
    };
  }, [displayName]);

  useEffect(() => {
    let active = true;

    async function loadRecentNotifications() {
      try {
        await pruneRecentNotifications();
        const records = await getRecentNotifications();
        if (active) setRecentNotifications(records);
      } catch {
        if (active) setRecentNotifications([]);
      }
    }

    void loadRecentNotifications();

    function handleServiceWorkerMessage(event: MessageEvent) {
      if ((event.data as { type?: string } | null)?.type === "contractor-invoice-notification-saved") {
        void loadRecentNotifications();
      }
    }

    navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);

    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
    };
  }, []);

  async function enableNotifications() {
    setStatus("enabling");
    setMessage("");
    const result = await enableContractorNotifications({ displayName });
    setStatus(result.status);
    setMessage(result.message ?? "");
  }

  const label =
    status === "enabled"
      ? "Notifications enabled"
    : status === "blocked"
        ? "Notification permission denied"
        : status === "unsupported"
          ? "Notifications not supported"
          : status === "enabling"
            ? "Enabling notifications..."
            : "Notifications not enabled";

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-white shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <Bell className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black">{label}</p>
          {message ? <p className="mt-1 text-sm text-slate-300">{message}</p> : null}
        </div>
      </div>
      <button
        type="button"
        className="mt-4 min-h-11 w-full rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
        onClick={enableNotifications}
        disabled={status === "blocked" || status === "unsupported" || status === "enabling"}
      >
        {status === "enabled" ? "Update notifications" : "Enable notifications"}
      </button>
      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-sm font-black text-white">Recent notifications</p>
        {recentNotifications.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {recentNotifications.map((notification) => (
              <li key={notification.id} className="rounded-lg bg-white/10 p-3">
                <p className="text-sm font-bold text-white">{notification.message}</p>
                <p className="mt-1 text-xs font-bold text-slate-300">
                  {formatNotificationTime(notification.receivedAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm font-bold text-slate-300">No recent notifications.</p>
        )}
      </div>
    </section>
  );
}

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

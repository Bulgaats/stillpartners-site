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
  getUnreadNotificationCount,
  markNotificationsRead,
  pruneRecentNotifications,
  type LocalNotificationRecord
} from "@/lib/contractor-invoice/notification-history";

export function NotificationPanel({
  displayName,
  profilePhone
}: {
  displayName?: string;
  profilePhone?: string;
}) {
  const [status, setStatus] = useState<NotificationStatus>("idle");
  const [message, setMessage] = useState("");
  const [notificationPhone, setNotificationPhone] = useState("");
  const [recentNotifications, setRecentNotifications] = useState<LocalNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showRecentNotifications, setShowRecentNotifications] = useState(false);
  const phoneForNotifications = profilePhone?.trim() || notificationPhone.trim();

  useEffect(() => {
    let active = true;

    async function restoreNotificationState() {
      if (!isPushSupported()) {
        if (active) setStatus("unsupported");
        return;
      }

      const result = await getContractorNotificationState({ displayName, phone: profilePhone });
      if (!active) return;
      setStatus(result.status);
      setMessage(result.message ?? "");
    }

    void restoreNotificationState();

    return () => {
      active = false;
    };
  }, [displayName, profilePhone]);

  useEffect(() => {
    let active = true;

    async function loadRecentNotifications() {
      try {
        await pruneRecentNotifications();
        const records = await getRecentNotifications();
        const count = await getUnreadNotificationCount();
        if (active) {
          setRecentNotifications(records);
          setUnreadCount(count);
        }
      } catch {
        if (active) {
          setRecentNotifications([]);
          setUnreadCount(0);
        }
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
    const result = await enableContractorNotifications({ displayName, phone: phoneForNotifications });
    setStatus(result.status);
    setMessage(result.message ?? "");
  }

  async function openRecentNotifications() {
    setShowRecentNotifications((current) => !current);

    if (!showRecentNotifications) {
      setUnreadCount(0);
      try {
        await markNotificationsRead();
      } catch {
        // Local notification history is a convenience and must not block the invoice app.
      }
    }
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
          <p className="mt-1 text-sm font-bold text-slate-300">
            {unreadCount === 1 ? "1 unread notification" : `${unreadCount} unread notifications`}
          </p>
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
      {!profilePhone?.trim() && status !== "enabled" ? (
        <label className="mt-4 grid gap-1 text-sm font-bold text-slate-200">
          Phone number
          <input
            className="min-h-11 rounded-lg border border-white/20 bg-white px-3 text-base font-normal text-slate-950 outline-none focus:border-white focus:ring-2 focus:ring-white/20"
            value={notificationPhone}
            onChange={(event) => setNotificationPhone(event.target.value)}
            inputMode="tel"
          />
          <span className="text-xs font-bold text-slate-300">
            Used only to match your notification device. Your full phone number is not stored.
          </span>
        </label>
      ) : null}
      <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
        <button
          type="button"
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2 text-left text-sm font-black text-white"
          onClick={() => {
            void openRecentNotifications();
          }}
        >
          <span>View recent notifications</span>
          <span className="text-xs text-slate-300">{showRecentNotifications ? "Hide" : "Open"}</span>
        </button>
        {showRecentNotifications ? (
          recentNotifications.length > 0 ? (
            <ul className="mt-3 grid max-h-56 gap-2 overflow-y-auto pr-1">
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
          )
        ) : null}
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

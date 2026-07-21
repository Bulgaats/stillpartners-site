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
  profilePhone,
  onUnreadCountChange
}: {
  displayName?: string;
  profilePhone?: string;
  onUnreadCountChange?: (count: number) => void;
}) {
  const [status, setStatus] = useState<NotificationStatus>("idle");
  const [message, setMessage] = useState("");
  const [notificationPhone, setNotificationPhone] = useState("");
  const [recentNotifications, setRecentNotifications] = useState<LocalNotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showRecentNotifications, setShowRecentNotifications] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "desktop" | "other">("other");
  const phoneForNotifications = notificationPhone.trim() || profilePhone?.trim() || "";

  useEffect(() => {
    if (!notificationPhone.trim() && profilePhone?.trim()) {
      setNotificationPhone(profilePhone.trim());
    }
  }, [notificationPhone, profilePhone]);

  useEffect(() => {
    const userAgent = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(userAgent)) {
      setPlatform("ios");
    } else if (/Macintosh|Windows|Linux/i.test(userAgent)) {
      setPlatform("desktop");
    }
  }, []);

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
          onUnreadCountChange?.(count);
        }
      } catch {
        if (active) {
          setRecentNotifications([]);
          setUnreadCount(0);
          onUnreadCountChange?.(0);
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
  }, [onUnreadCountChange]);

  async function enableNotifications() {
    setStatus("enabling");
    setMessage("");
    const result = await enableContractorNotifications({ displayName, phone: phoneForNotifications });
    setStatus(result.status);
    setMessage(result.message ?? "");
  }

  async function checkNotificationStatus() {
    setMessage("");
    const result = await getContractorNotificationState({ displayName, phone: phoneForNotifications });
    setStatus(result.status);
    setMessage(result.message ?? "");
  }

  async function openRecentNotifications() {
    setShowRecentNotifications((current) => !current);

    if (!showRecentNotifications) {
      setUnreadCount(0);
      onUnreadCountChange?.(0);
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
        ? "Notifications are blocked on this device or browser."
        : status === "unsupported"
          ? "Notifications are not available in this browser view."
          : status === "enabling"
            ? "Enabling notifications..."
            : "Notifications not enabled";
  const statusText =
    status === "blocked"
      ? "blocked"
      : status === "unsupported"
        ? "not available in this browser view"
        : status === "enabled"
          ? "enabled"
          : status === "enabling"
            ? "checking"
            : "ready to enable";
  const canEnable =
    status !== "unsupported" && status !== "enabling" && (status === "enabled" || Boolean(phoneForNotifications));

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-white shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
          <Bell className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black">{label}</p>
          <p className="mt-1 text-xs font-black uppercase text-slate-400">Status: {statusText}</p>
          <p className="mt-1 text-sm font-bold text-slate-300">
            {unreadCount === 1 ? "1 unread notification" : `${unreadCount} unread notifications`}
          </p>
          {message ? <p className="mt-1 text-sm text-slate-300">{message}</p> : null}
        </div>
      </div>
      {status === "blocked" ? (
        <>
          <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">
            Open this site in your browser notification settings and allow notifications, then return and check again.
            {platform === "ios" ? (
              <span className="mt-2 block">
                Open iPhone Settings &gt; Notifications, find this web app, and allow notifications. If the app is not
                listed, add this page to the Home Screen and open it from there.
              </span>
            ) : null}
            {platform === "desktop" ? (
              <span className="mt-2 block">
                Use the site settings next to the address bar and set Notifications to Allow.
              </span>
            ) : null}
          </p>
          <button
            type="button"
            className="mt-4 min-h-11 w-full rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950"
            onClick={() => {
              void checkNotificationStatus();
            }}
          >
            Check notification status
          </button>
        </>
      ) : status === "unsupported" ? (
        <>
          <p className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm font-bold text-amber-100">
            {platform === "ios" ? (
              <span className="block">
                On iPhone or iPad, install this page to the Home Screen first, then open the Home Screen app and enable
                notifications.
              </span>
            ) : null}
            <span className={platform === "ios" ? "mt-2 block" : "block"}>
              Try opening this app from the installed Home Screen app or use a supported browser.
            </span>
          </p>
          <button
            type="button"
            className="mt-4 min-h-11 w-full rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950"
            onClick={() => {
              void checkNotificationStatus();
            }}
          >
            Check notification status
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="mt-4 min-h-11 w-full rounded-lg bg-white px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            onClick={enableNotifications}
            disabled={!canEnable}
          >
            {status === "enabled" ? "Update notifications" : "Enable notifications"}
          </button>
          {!phoneForNotifications ? (
            <p className="mt-2 text-sm font-bold text-slate-300">Enter your phone number to enable notifications.</p>
          ) : null}
        </>
      )}
      {(status === "blocked" || status === "unsupported" || !profilePhone?.trim()) ? (
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

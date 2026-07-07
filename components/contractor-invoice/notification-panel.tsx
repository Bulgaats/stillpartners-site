"use client";

import { Bell } from "lucide-react";
import { useState } from "react";
import {
  enableContractorNotifications,
  isPushSupported,
  type NotificationStatus
} from "@/lib/contractor-invoice/push";

export function NotificationPanel({ displayName }: { displayName?: string }) {
  const [status, setStatus] = useState<NotificationStatus>(() =>
    isPushSupported() ? "idle" : "unsupported"
  );
  const [message, setMessage] = useState("");

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
    </section>
  );
}

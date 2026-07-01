"use client";

import { Send } from "lucide-react";
import { useState } from "react";

export function AdminNotificationPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function sendNotification() {
    setStatus("");
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus("Enter a notification message.");
      return;
    }
    if (trimmed.length > 50) {
      setStatus("Notification message must be 50 characters or less.");
      return;
    }
    if (!window.confirm("Send this notification to all app users?")) return;

    setBusy(true);
    try {
      const response = await fetch("/api/contractor-invoice/push/send-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, message: trimmed })
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        sent?: number;
        failed?: number;
        removed?: number;
      } | null;

      if (!response.ok) {
        setStatus(result?.error ?? "Notification could not be sent.");
        return;
      }

      setStatus(`Sent to ${result?.sent ?? 0}. Failed: ${result?.failed ?? 0}. Removed: ${result?.removed ?? 0}.`);
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-5 text-slate-950">
      <div className="mx-auto grid w-full max-w-xl gap-4">
        <header className="rounded-lg bg-slate-950 p-5 text-white shadow-sm">
          <p className="text-xs font-black uppercase text-slate-300">Still Partners Invoice</p>
          <h1 className="mt-2 text-2xl font-black">Admin notifications</h1>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-slate-800">
              Password
              <input
                className="min-h-12 rounded-lg border border-slate-300 px-3 text-base font-normal outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-800">
              Notification message
              <input
                className="min-h-12 rounded-lg border border-slate-300 px-3 text-base font-normal outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
                maxLength={50}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <p className="text-right text-xs font-bold text-slate-500">{message.length} / 50</p>
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:bg-slate-500"
              onClick={sendNotification}
              disabled={busy}
            >
              <Send className="size-4" aria-hidden="true" />
              Send to all
            </button>
            {status ? <p className="text-sm font-bold text-slate-700">{status}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

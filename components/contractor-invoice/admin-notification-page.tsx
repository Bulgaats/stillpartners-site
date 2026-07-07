"use client";

import { RefreshCw, Search, Send } from "lucide-react";
import { useMemo, useState } from "react";

type Subscriber = {
  id: string;
  display_name: string;
  device_label: string | null;
  last_seen_at: string | null;
  notification_enabled: boolean;
};

type SendResult = {
  selected?: number;
  sent?: number;
  failed?: number;
  disabled?: number;
  error?: string;
};

export function AdminNotificationPage() {
  const [adminName, setAdminName] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const visibleSubscribers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return subscribers;

    return subscribers.filter((subscriber) =>
      subscriber.display_name.toLowerCase().includes(normalizedQuery)
    );
  }, [query, subscribers]);

  async function loadSubscribers({ preserveStatus = false }: { preserveStatus?: boolean } = {}) {
    setBusy(true);
    if (!preserveStatus) setStatus("");
    try {
      const response = await fetch("/api/contractor-invoice/push/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName, adminPassword: password })
      });
      const result = (await response.json().catch(() => null)) as
        | { subscribers?: Subscriber[]; error?: string }
        | null;

      if (!response.ok) {
        setIsAuthenticated(false);
        setStatus(result?.error ?? "Notification subscribers could not be loaded.");
        return;
      }

      setIsAuthenticated(true);
      setSubscribers(result?.subscribers ?? []);
      setSelectedIds((current) =>
        current.filter((id) =>
          (result?.subscribers ?? []).some(
            (subscriber) => subscriber.id === id && subscriber.notification_enabled
          )
        )
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function sendSelectedNotification() {
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
    if (selectedIds.length === 0) {
      setStatus("Select at least one notification subscriber.");
      return;
    }
    if (!window.confirm("Send this app notification to selected recipients?")) return;

    setBusy(true);
    try {
      const response = await fetch("/api/contractor-invoice/push/send-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminPassword: password,
          adminName,
          message: trimmed,
          subscriberIds: selectedIds
        })
      });
      const result = (await response.json().catch(() => null)) as SendResult | null;

      if (!response.ok) {
        setStatus(result?.error ?? "App notification could not be sent.");
        return;
      }

      setStatus(
        `Selected: ${result?.selected ?? selectedIds.length}. Sent: ${result?.sent ?? 0}. Failed: ${
          result?.failed ?? 0
        }. Disabled: ${result?.disabled ?? 0}.`
      );
      setMessage("");
      await loadSubscribers({ preserveStatus: true });
    } finally {
      setBusy(false);
    }
  }

  function toggleSubscriber(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  function selectAllVisible() {
    setSelectedIds((current) => [...new Set([...current, ...visibleSubscribers.map((subscriber) => subscriber.id)])]);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-5 text-slate-950">
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <header className="rounded-lg bg-slate-950 p-5 text-white shadow-sm">
          <p className="text-xs font-black uppercase text-slate-300">Still Partners Invoice</p>
          <h1 className="mt-2 text-2xl font-black">Admin notifications</h1>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-slate-800">
              Admin name
              <input
                className="min-h-12 rounded-lg border border-slate-300 px-3 text-base font-normal outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
                value={adminName}
                onChange={(event) => setAdminName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-800">
              Password
              <input
                className="min-h-12 rounded-lg border border-slate-300 px-3 text-base font-normal outline-none focus:border-slate-950 focus:ring-2 focus:ring-slate-950/15"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:bg-slate-500"
              onClick={() => {
                void loadSubscribers();
              }}
              disabled={busy}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Load notification subscribers
            </button>
          </div>
        </section>

        {isAuthenticated ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-950">Notification subscribers</h2>
                  <span className="text-xs font-black text-slate-500">{selectedIds.length} selected</span>
                </div>
                <label className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800">
                  <Search className="size-4 text-slate-500" aria-hidden="true" />
                  <input
                    className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-base font-normal outline-none"
                    placeholder="Search by display name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-950"
                    onClick={selectAllVisible}
                  >
                    Select all visible
                  </button>
                  <button
                    type="button"
                    className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-950"
                    onClick={clearSelection}
                  >
                    Clear selection
                  </button>
                </div>

                <div className="grid gap-2">
                  {visibleSubscribers.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">
                      No notification subscribers found.
                    </p>
                  ) : (
                    visibleSubscribers.map((subscriber) => (
                      <label
                        key={subscriber.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
                          subscriber.notification_enabled
                            ? "border-slate-200 bg-slate-50"
                            : "border-slate-200 bg-slate-100 text-slate-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4 accent-slate-950"
                          checked={selectedIds.includes(subscriber.id)}
                          onChange={() => toggleSubscriber(subscriber.id)}
                          disabled={!subscriber.notification_enabled}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-black text-slate-950">{subscriber.display_name}</span>
                          <span className="block text-xs font-bold text-slate-500">
                            {subscriber.device_label ?? "Device"} | Last seen:{" "}
                            {subscriber.last_seen_at ? formatDateTime(subscriber.last_seen_at) : "Not recorded"}
                          </span>
                          {!subscriber.notification_enabled ? (
                            <span className="mt-1 block text-xs font-black text-red-700">Notifications disabled</span>
                          ) : null}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-950">Send notification</h2>
                  <span className="text-xs font-black text-slate-500">
                    Selected recipients: {selectedIds.length}
                  </span>
                </div>
                <label className="grid gap-1 text-sm font-bold text-slate-800">
                  App notification message
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
                  className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-500"
                  onClick={() => {
                    void sendSelectedNotification();
                  }}
                  disabled={busy || selectedIds.length === 0}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Send to selected
                </button>
              </div>
            </section>
          </>
        ) : null}

        {status ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
            {status}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

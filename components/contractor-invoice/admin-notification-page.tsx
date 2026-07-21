"use client";

import { RefreshCw, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AdminTab = "send" | "inactive" | "history";

type Subscriber = {
  id: string;
  display_name: string;
  device_label: string | null;
  phone_hash: string | null;
  phone_last4: string | null;
  last_seen_at: string | null;
  notification_enabled: boolean;
};

type SubscriberGroup = {
  id: string;
  displayName: string;
  otherNames: string[];
  phoneLast4: string | null;
  devices: Subscriber[];
};

type SendResult = {
  selected?: number;
  sent?: number;
  failed?: number;
  disabled?: number;
  error?: string;
};

type SubscribersResponse = {
  subscribers?: Subscriber[];
  admin?: {
    name?: string;
  };
  error?: string;
};

type NotificationHistoryEvent = {
  id: string;
  message: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  disabled_count: number;
  sent_by_admin: string;
  created_at: string | null;
};

type HistoryResponse = {
  events?: NotificationHistoryEvent[];
  error?: string;
};

export function AdminNotificationPage() {
  const [adminName, setAdminName] = useState("");
  const [signedInAdminName, setSignedInAdminName] = useState("");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [historyEvents, setHistoryEvents] = useState<NotificationHistoryEvent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);
  const [sendResult, setSendResult] = useState<Required<Pick<SendResult, "selected" | "sent" | "failed" | "disabled">> | null>(
    null
  );
  const [activeTab, setActiveTab] = useState<AdminTab>("send");

  useEffect(() => {
    async function checkExistingSession() {
      setBusy(true);
      try {
        const response = await fetch("/api/contractor-invoice/push/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
        const result = (await response.json().catch(() => null)) as SubscribersResponse | null;

        if (!response.ok) return;

        setIsAuthenticated(true);
        setSignedInAdminName(result?.admin?.name?.trim() || "Admin");
        setPassword("");
        setSubscribers(result?.subscribers ?? []);
        void loadHistory();
      } finally {
        setBusy(false);
      }
    }

    void checkExistingSession();
  }, []);

  const sendableSubscribers = useMemo(() => subscribers.filter((subscriber) => subscriber.notification_enabled), [subscribers]);
  const inactiveSubscribers = useMemo(() => subscribers.filter((subscriber) => !isActiveSubscriber(subscriber)), [subscribers]);

  const visibleGroups = useMemo(() => {
    const tabSubscribers = activeTab === "inactive" ? inactiveSubscribers : sendableSubscribers;
    const groups = createSubscriberGroups(tabSubscribers);
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return groups;

    return groups.filter((group) =>
      [group.displayName, ...group.otherNames, group.phoneLast4 ? `***${group.phoneLast4}` : ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [activeTab, inactiveSubscribers, query, sendableSubscribers]);

  async function loadSubscribers({
    preserveStatus = false,
    silentSessionCheck = false
  }: {
    preserveStatus?: boolean;
    silentSessionCheck?: boolean;
  } = {}) {
    setBusy(true);
    if (!preserveStatus) setStatus("");
    try {
      const response = await fetch("/api/contractor-invoice/push/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName, adminPassword: password })
      });
      const result = (await response.json().catch(() => null)) as SubscribersResponse | null;

      if (!response.ok) {
        setIsAuthenticated(false);
        if (response.status === 401) {
          if (!silentSessionCheck) {
            setStatus("Invalid admin credentials.");
          }
        } else {
          setStatus(result?.error ?? "Notification subscribers could not be loaded. Check the Supabase migration and service role configuration.");
        }
        return;
      }

      setIsAuthenticated(true);
      setSignedInAdminName(result?.admin?.name?.trim() || adminName.trim());
      setPassword("");
      setSubscribers(result?.subscribers ?? []);
      void loadHistory();
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

  async function signOut() {
    setBusy(true);
    setStatus("");
    try {
      await fetch("/api/contractor-invoice/push/sign-out", {
        method: "POST"
      });
    } finally {
      setIsAuthenticated(false);
      setSignedInAdminName("");
      setPassword("");
      setSubscribers([]);
      setHistoryEvents([]);
      setSelectedIds([]);
      setSendResult(null);
      setShowSendConfirmation(false);
      setBusy(false);
    }
  }

  async function loadHistory() {
    const response = await fetch("/api/contractor-invoice/push/history", {
      method: "GET"
    });
    const result = (await response.json().catch(() => null)) as HistoryResponse | null;

    if (!response.ok) {
      setHistoryEvents([]);
      if (response.status !== 401) {
        setStatus(result?.error ?? "Notification history could not be loaded.");
      }
      return;
    }

    setHistoryEvents(result?.events ?? []);
  }

  function requestSendConfirmation() {
    setStatus("");
    setSendResult(null);
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

    setShowSendConfirmation(true);
  }

  async function sendSelectedNotification() {
    setStatus("");
    setSendResult(null);
    const trimmed = message.trim();

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

      setSendResult({
        selected: result?.selected ?? selectedIds.length,
        sent: result?.sent ?? 0,
        failed: result?.failed ?? 0,
        disabled: result?.disabled ?? 0
      });
      setMessage("");
      await loadSubscribers({ preserveStatus: true });
      await loadHistory();
    } finally {
      setShowSendConfirmation(false);
      setBusy(false);
    }
  }

  function toggleSubscriber(id: string) {
    if (activeTab !== "send") return;
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
  }

  function toggleGroup(group: SubscriberGroup) {
    if (activeTab !== "send") return;
    const activeDeviceIds = group.devices.filter((subscriber) => subscriber.notification_enabled).map((subscriber) => subscriber.id);
    if (activeDeviceIds.length === 0) return;

    setSelectedIds((current) => {
      const allSelected = activeDeviceIds.every((id) => current.includes(id));
      if (allSelected) {
        return current.filter((id) => !activeDeviceIds.includes(id));
      }

      return [...new Set([...current, ...activeDeviceIds])];
    });
  }

  function selectAllVisible() {
    if (activeTab !== "send") return;
    setSelectedIds((current) => [
      ...new Set([
        ...current,
        ...visibleGroups.flatMap((group) =>
          group.devices.filter((subscriber) => subscriber.notification_enabled).map((subscriber) => subscriber.id)
        )
      ])
    ]);
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

        {!isAuthenticated ? (
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
        ) : (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <p className="text-sm font-bold text-slate-700">
                Signed in as: <span className="font-black text-slate-950">{signedInAdminName || "Admin"}</span>
              </p>
              <button
                type="button"
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-wait disabled:text-slate-500"
                onClick={() => {
                  void loadSubscribers();
                }}
                disabled={busy}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Reload subscribers
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:cursor-wait disabled:bg-slate-500"
                onClick={() => {
                  void signOut();
                }}
                disabled={busy}
              >
                Sign out
              </button>
            </div>
          </section>
        )}

        {isAuthenticated ? (
          <>
            <nav className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
              <button
                type="button"
                className={`min-h-10 rounded-lg px-3 text-xs font-black ${
                  activeTab === "send" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => setActiveTab("send")}
              >
                Send notification
              </button>
              <button
                type="button"
                className={`min-h-10 rounded-lg px-3 text-xs font-black ${
                  activeTab === "inactive" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => setActiveTab("inactive")}
              >
                Inactive devices
              </button>
              <button
                type="button"
                className={`min-h-10 rounded-lg px-3 text-xs font-black ${
                  activeTab === "history" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => {
                  setActiveTab("history");
                  void loadHistory();
                }}
              >
                History
              </button>
            </nav>

            {activeTab === "send" || activeTab === "inactive" ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-950">
                    {activeTab === "inactive" ? "Inactive devices" : "Send notification"}
                  </h2>
                  {activeTab === "send" ? (
                    <span className="text-xs font-black text-slate-500">{selectedIds.length} selected</span>
                  ) : null}
                </div>
                <p className="text-sm font-bold text-slate-500">
                  {activeTab === "inactive"
                    ? "Disabled or stale devices are shown here for review."
                    : "Search recipients, select devices, write a message, then send an app notification."}
                </p>
                <label className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-800">
                  <Search className="size-4 text-slate-500" aria-hidden="true" />
                  <input
                    className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-base font-normal outline-none"
                    placeholder="Search by display name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                {activeTab === "send" ? (
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
                ) : null}

                <div className="grid gap-2">
                  {visibleGroups.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">
                      No notification subscribers found.
                    </p>
                  ) : (
                    visibleGroups.map((group) => (
                      <div key={group.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                        <label className="flex items-start gap-3">
                          {activeTab === "send" ? (
                            <input
                              type="checkbox"
                              className="mt-1 size-4 accent-slate-950"
                              checked={isGroupSelected(group, selectedIds)}
                              onChange={() => toggleGroup(group)}
                              disabled={!group.devices.some((subscriber) => subscriber.notification_enabled)}
                            />
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block font-black text-slate-950">
                              {group.displayName}
                              {group.phoneLast4 ? ` - ***${group.phoneLast4}` : ""}
                              {group.devices.length > 1 ? ` - ${group.devices.length} devices` : ""}
                            </span>
                            {group.otherNames.length > 0 ? (
                              <span className="mt-1 block text-xs font-bold text-slate-500">
                                Also seen as: {group.otherNames.join(", ")}
                              </span>
                            ) : null}
                          </span>
                        </label>
                        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3">
                          {group.devices.map((subscriber) => (
                            <label key={subscriber.id} className="flex items-start gap-3 rounded-lg bg-white p-2">
                              {activeTab === "send" ? (
                                <input
                                  type="checkbox"
                                  className="mt-1 size-4 accent-slate-950"
                                  checked={selectedIds.includes(subscriber.id)}
                                  onChange={() => toggleSubscriber(subscriber.id)}
                                  disabled={!subscriber.notification_enabled}
                                />
                              ) : null}
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-black text-slate-700">
                                  {subscriber.device_label ?? "Device"}
                                </span>
                                <span className="block text-xs font-bold text-slate-500">
                                  Last seen: {subscriber.last_seen_at ? formatDateTime(subscriber.last_seen_at) : "Not recorded"}
                                </span>
                                <DeviceStatus subscriber={subscriber} />
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
            ) : null}

            {activeTab === "send" ? (
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
                    requestSendConfirmation();
                  }}
                  disabled={busy || selectedIds.length === 0}
                >
                  <Send className="size-4" aria-hidden="true" />
                  Send to selected
                </button>
              </div>
            </section>
            ) : null}

            {activeTab === "history" ? (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-black text-slate-950">History</h2>
                    <button
                      type="button"
                      className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-950"
                      onClick={() => {
                        void loadHistory();
                      }}
                    >
                      Reload history
                    </button>
                  </div>
                  {historyEvents.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">
                      No notification history.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {historyEvents.map((event) => (
                        <article key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                          <p className="font-black text-slate-950">{event.message}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">
                            Sent by {event.sent_by_admin} - {event.created_at ? formatDateTime(event.created_at) : "Time not recorded"}
                          </p>
                          <dl className="mt-3 grid grid-cols-4 gap-2">
                            <div>
                              <dt className="text-xs font-black uppercase text-slate-500">Selected</dt>
                              <dd className="text-base font-black text-slate-950">{event.recipient_count}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-black uppercase text-slate-500">Sent</dt>
                              <dd className="text-base font-black text-slate-950">{event.sent_count}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-black uppercase text-slate-500">Failed</dt>
                              <dd className="text-base font-black text-slate-950">{event.failed_count}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-black uppercase text-slate-500">Disabled</dt>
                              <dd className="text-base font-black text-slate-950">{event.disabled_count}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {status ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm">
            {status}
          </p>
        ) : null}

        {sendResult ? (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950 shadow-sm">
            <p className="font-black">Notification sent.</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <dt className="text-xs uppercase text-emerald-700">Selected</dt>
                <dd className="text-lg font-black">{sendResult.selected}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-emerald-700">Sent</dt>
                <dd className="text-lg font-black">{sendResult.sent}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-emerald-700">Failed</dt>
                <dd className="text-lg font-black">{sendResult.failed}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-emerald-700">Disabled</dt>
                <dd className="text-lg font-black">{sendResult.disabled}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>
      {showSendConfirmation ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-confirmation-title"
            className="grid w-full max-w-sm gap-4 rounded-lg bg-white p-5 text-slate-950 shadow-xl"
          >
            <h2 id="send-confirmation-title" className="text-lg font-black">
              Send this app notification to selected recipients?
            </h2>
            <p className="text-sm font-bold text-slate-600">Selected recipients: {selectedIds.length}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-950 disabled:cursor-wait disabled:text-slate-500"
                onClick={() => setShowSendConfirmation(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:cursor-wait disabled:bg-slate-500"
                onClick={() => {
                  void sendSelectedNotification();
                }}
                disabled={busy}
              >
                {busy ? "Sending..." : "Send"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function DeviceStatus({ subscriber }: { subscriber: Subscriber }) {
  if (!subscriber.notification_enabled) {
    return <span className="mt-1 block text-xs font-black text-red-700">Notifications disabled</span>;
  }

  const daysSinceSeen = getDaysSinceSeen(subscriber);
  if (daysSinceSeen === null) {
    return <span className="mt-1 block text-xs font-black text-amber-700">Possibly inactive - last seen unknown</span>;
  }
  if (daysSinceSeen > 10) {
    return (
      <span className="mt-1 block text-xs font-black text-amber-700">
        Possibly inactive - last seen {daysSinceSeen} days ago
      </span>
    );
  }

  return null;
}

function isActiveSubscriber(subscriber: Subscriber) {
  if (!subscriber.notification_enabled || !subscriber.last_seen_at) return false;
  const lastSeenAt = Date.parse(subscriber.last_seen_at);
  if (!Number.isFinite(lastSeenAt)) return false;

  return Date.now() - lastSeenAt <= 10 * 24 * 60 * 60 * 1000;
}

function createSubscriberGroups(subscribers: Subscriber[]) {
  const grouped = new Map<string, Subscriber[]>();

  for (const subscriber of subscribers) {
    const groupKey = subscriber.phone_hash ? `phone:${subscriber.phone_hash}` : `subscription:${subscriber.id}`;
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), subscriber]);
  }

  return [...grouped.entries()]
    .map(([id, devices]) => {
      const sortedDevices = [...devices].sort(compareLastSeenDesc);
      const displayName = sortedDevices[0]?.display_name || "Unnamed contractor";
      const otherNames = [
        ...new Set(
          sortedDevices
            .map((subscriber) => subscriber.display_name)
            .filter((name) => name && name !== displayName)
        )
      ];

      return {
        id,
        displayName,
        otherNames,
        phoneLast4: sortedDevices.find((subscriber) => subscriber.phone_last4)?.phone_last4 ?? null,
        devices: sortedDevices
      } satisfies SubscriberGroup;
    })
    .sort((left, right) => compareLastSeenDesc(left.devices[0], right.devices[0]));
}

function isGroupSelected(group: SubscriberGroup, selectedIds: string[]) {
  const enabledDeviceIds = group.devices.filter((subscriber) => subscriber.notification_enabled).map((subscriber) => subscriber.id);
  return enabledDeviceIds.length > 0 && enabledDeviceIds.every((id) => selectedIds.includes(id));
}

function compareLastSeenDesc(left?: Subscriber, right?: Subscriber) {
  return getLastSeenTime(right) - getLastSeenTime(left);
}

function getLastSeenTime(subscriber?: Subscriber) {
  if (!subscriber?.last_seen_at) return 0;
  const timestamp = Date.parse(subscriber.last_seen_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDaysSinceSeen(subscriber: Subscriber) {
  const lastSeenAt = getLastSeenTime(subscriber);
  if (!lastSeenAt) return null;
  return Math.max(0, Math.floor((Date.now() - lastSeenAt) / (24 * 60 * 60 * 1000)));
}

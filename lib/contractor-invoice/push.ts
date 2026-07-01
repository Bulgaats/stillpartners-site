"use client";

export type NotificationStatus =
  | "idle"
  | "enabling"
  | "enabled"
  | "blocked"
  | "unsupported"
  | "error";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function enableContractorNotifications() {
  if (!isPushSupported()) {
    return { ok: false, status: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return { ok: false, status: "blocked" as const };
  }
  if (permission !== "granted") {
    return { ok: false, status: "idle" as const };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, status: "error" as const, message: "VAPID public key is missing." };
  }

  const registration = await navigator.serviceWorker.register("/contractor-invoice/sw.js", {
    scope: "/contractor-invoice/"
  });
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    }));

  const response = await fetch("/api/contractor-invoice/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription)
  });

  if (!response.ok) {
    return { ok: false, status: "error" as const, message: "Subscription could not be saved." };
  }

  return { ok: true, status: "enabled" as const };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

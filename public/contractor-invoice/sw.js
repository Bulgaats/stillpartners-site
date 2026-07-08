self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Still Partners",
    body: "Still Partners notification",
    url: "/contractor-invoice"
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    Promise.all([
      saveLocalNotification(payload.body),
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/contractor-invoice/icon-192.png",
        badge: "/contractor-invoice/icon-192.png",
        data: {
          url: payload.url || "/contractor-invoice"
        }
      })
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/contractor-invoice", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});

const DB_NAME = "still-partners-invoice-notifications";
const DB_VERSION = 2;
const STORE_NAME = "notifications";
const META_STORE_NAME = "metadata";
const UNREAD_COUNT_KEY = "unread-count";
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

async function saveLocalNotification(message) {
  try {
    const db = await openNotificationDb();
    await pruneOldNotifications(db);
    await putNotification(db, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      message: String(message || "Still Partners notification"),
      receivedAt: new Date().toISOString()
    });
    const unreadCount = await incrementUnreadCount(db);
    await updateAppBadge(unreadCount);
    await notifyClients();
  } catch {
    // Notification display must still work if local inbox storage is unavailable.
  }
}

function openNotificationDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putNotification(db, notification) {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(notification);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

function pruneOldNotifications(db) {
  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      for (const record of request.result || []) {
        const timestamp = Date.parse(record.receivedAt);
        if (!Number.isFinite(timestamp) || Date.now() - timestamp > MAX_AGE_MS) {
          store.delete(record.id);
        }
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

function incrementUnreadCount(db) {
  return new Promise((resolve) => {
    const transaction = db.transaction(META_STORE_NAME, "readwrite");
    const store = transaction.objectStore(META_STORE_NAME);
    const request = store.get(UNREAD_COUNT_KEY);

    request.onsuccess = () => {
      const currentValue = request.result && typeof request.result.value === "number" ? request.result.value : 0;
      const nextValue = currentValue + 1;
      store.put({
        key: UNREAD_COUNT_KEY,
        value: nextValue
      });
      resolve(nextValue);
    };
    request.onerror = () => resolve(0);
    transaction.onerror = () => resolve(0);
  });
}

async function updateAppBadge(count) {
  try {
    if (count > 0 && typeof self.registration.setAppBadge === "function") {
      await self.registration.setAppBadge(count);
    }
  } catch {
    // Badge support is optional.
  }
}

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "contractor-invoice-notification-saved" });
  }
}

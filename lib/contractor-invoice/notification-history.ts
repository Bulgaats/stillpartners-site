"use client";

export type LocalNotificationRecord = {
  id: string;
  title?: string;
  message: string;
  receivedAt: string;
  readAt?: string | null;
};

const DB_NAME = "still-partners-invoice-notifications";
const DB_VERSION = 2;
const STORE_NAME = "notifications";
const META_STORE_NAME = "metadata";
const UNREAD_COUNT_KEY = "unread-count";
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

export async function getRecentNotifications() {
  const db = await openNotificationDb();
  await pruneOldNotifications(db);

  return new Promise<LocalNotificationRecord[]>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      const records = (request.result as LocalNotificationRecord[])
        .filter((record) => isRecent(record.receivedAt))
        .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt));
      resolve(records);
    };
    request.onerror = () => resolve([]);
  });
}

export async function getNotificationInbox() {
  const records = await getRecentNotifications();
  return {
    unread: records.filter((record) => record.readAt === null),
    previous: records.filter((record) => record.readAt !== null)
  };
}

export async function pruneRecentNotifications() {
  const db = await openNotificationDb();
  await pruneOldNotifications(db);
}

export async function getUnreadNotificationCount() {
  const db = await openNotificationDb();

  return new Promise<number>((resolve) => {
    const transaction = db.transaction(META_STORE_NAME, "readonly");
    const request = transaction.objectStore(META_STORE_NAME).get(UNREAD_COUNT_KEY);

    request.onsuccess = () => {
      const record = request.result as { value?: unknown } | undefined;
      resolve(typeof record?.value === "number" && record.value > 0 ? record.value : 0);
    };
    request.onerror = () => resolve(0);
  });
}

export async function syncAppBadgeToUnreadCount() {
  const count = await getUnreadNotificationCount();
  await updateAppBadge(count);
  return count;
}

export async function markNotificationsRead() {
  const db = await openNotificationDb();
  await markStoredNotificationsRead(db);
  await setUnreadCount(db, 0);
  await updateAppBadge(0);
  window.dispatchEvent(new CustomEvent("contractor-invoice-notifications-read"));
}

function openNotificationDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
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

function pruneOldNotifications(db: IDBDatabase) {
  return new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      for (const record of request.result as LocalNotificationRecord[]) {
        if (!isRecent(record.receivedAt)) {
          store.delete(record.id);
        }
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

function markStoredNotificationsRead(db: IDBDatabase) {
  return new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    const readAt = new Date().toISOString();

    request.onsuccess = () => {
      for (const record of request.result as LocalNotificationRecord[]) {
        if (record.readAt === null) {
          store.put({
            ...record,
            readAt
          });
        }
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

function isRecent(receivedAt: string) {
  const timestamp = Date.parse(receivedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_AGE_MS;
}

function setUnreadCount(db: IDBDatabase, count: number) {
  return new Promise<void>((resolve) => {
    const transaction = db.transaction(META_STORE_NAME, "readwrite");
    transaction.objectStore(META_STORE_NAME).put({
      key: UNREAD_COUNT_KEY,
      value: Math.max(0, count)
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

async function updateAppBadge(count: number) {
  const badgeNavigator = navigator as Navigator & {
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  try {
    if (count > 0 && typeof badgeNavigator.setAppBadge === "function") {
      await badgeNavigator.setAppBadge(count);
    } else if (count === 0 && typeof badgeNavigator.clearAppBadge === "function") {
      await badgeNavigator.clearAppBadge();
    }
  } catch {
    // The app must continue normally when badge APIs are unavailable.
  }
}

"use client";

export type LocalNotificationRecord = {
  id: string;
  message: string;
  receivedAt: string;
};

const DB_NAME = "still-partners-invoice-notifications";
const DB_VERSION = 1;
const STORE_NAME = "notifications";
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

export async function pruneRecentNotifications() {
  const db = await openNotificationDb();
  await pruneOldNotifications(db);
}

function openNotificationDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
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

function isRecent(receivedAt: string) {
  const timestamp = Date.parse(receivedAt);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= MAX_AGE_MS;
}

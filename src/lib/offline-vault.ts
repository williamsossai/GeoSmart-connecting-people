const DATABASE_NAME = 'geosmart-offline-vault';
const DATABASE_VERSION = 1;
const KEY_STORE = 'user-keys';
const RECORD_STORE = 'encrypted-records';
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_DRAFT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface OfflineProfileValues {
  firstName: string;
  lastName: string;
  otherNames: string;
  bio: string;
  currentResidenceSummary: string;
  originSummary: string;
  visibility: 'private' | 'shared' | 'public';
}

export interface OfflineProfileDraft {
  values: OfflineProfileValues;
  baseline: OfflineProfileValues;
  savedAt: number;
}

interface StoredKey {
  userId: string;
  key: CryptoKey;
}

interface EncryptedRecord {
  id: string;
  userId: string;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
  updatedAt: number;
}

let activeUserId: string | null = null;
let databasePromise: Promise<IDBDatabase> | null = null;
const keyPromises = new Map<string, Promise<CryptoKey>>();

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE)) database.createObjectStore(KEY_STORE, { keyPath: 'userId' });
      if (!database.objectStoreNames.contains(RECORD_STORE)) {
        const records = database.createObjectStore(RECORD_STORE, { keyPath: 'id' });
        records.createIndex('by-user', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local offline storage.'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Local offline storage failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Local offline storage was interrupted.'));
  });
}

async function getEncryptionKey(userId: string) {
  const pending = keyPromises.get(userId);
  if (pending) return pending;

  const keyPromise = (async () => {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error('Encrypted offline storage is not available in this browser.');
    const database = await openDatabase();
    const readTransaction = database.transaction(KEY_STORE, 'readonly');
    const existing = await new Promise<StoredKey | undefined>((resolve, reject) => {
      const request = readTransaction.objectStore(KEY_STORE).get(userId);
      request.onsuccess = () => resolve(request.result as StoredKey | undefined);
      request.onerror = () => reject(request.error || new Error('Could not read the offline encryption key.'));
    });
    if (existing?.key) return existing.key;

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const writeTransaction = database.transaction(KEY_STORE, 'readwrite');
    writeTransaction.objectStore(KEY_STORE).put({ userId, key } satisfies StoredKey);
    await transactionDone(writeTransaction);
    return key;
  })();
  keyPromises.set(userId, keyPromise);
  try {
    return await keyPromise;
  } finally {
    keyPromises.delete(userId);
  }
}

async function writeEncryptedRecord(userId: string, recordName: string, value: unknown) {
  const key = await getEncryptionKey(userId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const database = await openDatabase();
  const transaction = database.transaction(RECORD_STORE, 'readwrite');
  transaction.objectStore(RECORD_STORE).put({
    id: `${userId}:${recordName}`,
    userId,
    iv: iv.buffer,
    ciphertext,
    updatedAt: Date.now(),
  } satisfies EncryptedRecord);
  await transactionDone(transaction);
}

async function readEncryptedRecord<T>(userId: string, recordName: string, maxAgeMs: number): Promise<T | null> {
  const database = await openDatabase();
  const transaction = database.transaction(RECORD_STORE, 'readonly');
  const record = await new Promise<EncryptedRecord | undefined>((resolve, reject) => {
    const request = transaction.objectStore(RECORD_STORE).get(`${userId}:${recordName}`);
    request.onsuccess = () => resolve(request.result as EncryptedRecord | undefined);
    request.onerror = () => reject(request.error || new Error('Could not read the offline record.'));
  });
  if (!record) return null;
  if (Date.now() - record.updatedAt > maxAgeMs) {
    await deleteEncryptedRecord(userId, recordName);
    return null;
  }

  const key = await getEncryptionKey(userId);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function deleteEncryptedRecord(userId: string, recordName: string) {
  const database = await openDatabase();
  const transaction = database.transaction(RECORD_STORE, 'readwrite');
  transaction.objectStore(RECORD_STORE).delete(`${userId}:${recordName}`);
  await transactionDone(transaction);
}

export function setOfflineUserScope(userId: string | null) {
  // Preserve a signed-out user's encrypted draft so it is available next time
  // they sign in. Remove it only when a different account takes over this device.
  if (activeUserId && userId && activeUserId !== userId) void clearOfflineUserData(activeUserId).catch(() => undefined);
  activeUserId = userId;
}

export function getActiveOfflineUserId() {
  return activeUserId;
}

export async function saveOfflineOverview(userId: string, overview: unknown) {
  try {
    await writeEncryptedRecord(userId, 'overview', overview);
  } catch (error) {
    console.warn('Could not save the encrypted offline profile snapshot:', error);
  }
}

export async function getOfflineOverview<T>(userId: string): Promise<T | null> {
  try {
    return await readEncryptedRecord<T>(userId, 'overview', MAX_CACHE_AGE_MS);
  } catch (error) {
    console.warn('Could not read the encrypted offline profile snapshot:', error);
    return null;
  }
}

export async function saveOfflineProfileDraft(userId: string, draft: OfflineProfileDraft) {
  await writeEncryptedRecord(userId, 'profile-draft', draft);
}

export async function getOfflineProfileDraft(userId: string) {
  try {
    return await readEncryptedRecord<OfflineProfileDraft>(userId, 'profile-draft', MAX_DRAFT_AGE_MS);
  } catch (error) {
    console.warn('Could not read the encrypted offline profile draft:', error);
    return null;
  }
}

export async function removeOfflineProfileDraft(userId: string) {
  try {
    await deleteEncryptedRecord(userId, 'profile-draft');
  } catch (error) {
    console.warn('Could not remove the offline profile draft:', error);
  }
}

export async function clearOfflineUserData(userId: string) {
  const database = await openDatabase();
  const transaction = database.transaction([KEY_STORE, RECORD_STORE], 'readwrite');
  transaction.objectStore(KEY_STORE).delete(userId);
  const records = transaction.objectStore(RECORD_STORE);
  const index = records.index('by-user');
  const request = index.openKeyCursor(IDBKeyRange.only(userId));
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    records.delete(cursor.primaryKey);
    cursor.continue();
  };
  await transactionDone(transaction);
  keyPromises.delete(userId);
}

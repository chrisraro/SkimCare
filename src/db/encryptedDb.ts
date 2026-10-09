/**
 * Opens the review database encrypted with SQLCipher (PRD §14).
 *
 * - The key is 32 random bytes from expo-crypto, generated once and kept in
 *   expo-secure-store (Android Keystore / iOS Keychain), this device only.
 * - `PRAGMA key` is the first statement on the connection (expo-sqlite docs).
 * - If SQLCipher is not linked into this build, or the key does not open the
 *   file, this throws: the app then keeps reviews in memory and says so. It
 *   never falls back to an unencrypted database.
 *
 * Never log the key or any row content.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { SqlDb } from './adapter';

const DB_NAME = 'skimcare.db';
const KEY_NAME = 'skimcare.db.key.v1';
const HEX_KEY = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getOrCreateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing !== null) {
    // A damaged key is not replaced: a new key could never open the existing file.
    if (!HEX_KEY.test(existing)) throw new Error('Stored database key is unreadable.');
    return existing;
  }
  const key = toHex(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  return key;
}

export async function openEncryptedDb(): Promise<SqlDb> {
  const key = await getOrCreateKey();
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  try {
    // Raw 256-bit key (no passphrase derivation). The key is hex we generated, never user input.
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version;');
    if (!cipher?.cipher_version) throw new Error('SQLCipher is not available in this build.');
    // Fails with "file is not a database" when the key does not match the file.
    await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master;');
  } catch (e) {
    await db.closeAsync().catch(() => undefined);
    throw e;
  }

  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) => db.getAllAsync<T>(sql, params),
  };
}

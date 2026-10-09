/**
 * DocumentRepository + SettingsRepository over a SQL database (PRD §13–14).
 * The database handle is injected (src/db/adapter.ts) so this logic runs in Jest
 * with a fake; on the phone it is the SQLCipher-keyed expo-sqlite database.
 *
 * Rows are untrusted on load: each one is parsed with the Zod DocumentRecord
 * schema and unreadable rows are skipped (left in place, never shown). Nothing
 * here logs row contents.
 */
import { DocumentRecord } from '@/domain/schema';
import type { PageFileStore, SqlDb } from './adapter';
import type { DocumentRepository, SettingsRepository } from './repository';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT);
`;

export interface SqliteRepository extends DocumentRepository, SettingsRepository {
  /** Ids of rows the last list() skipped because they failed validation. */
  readonly skippedIds: readonly string[];
}

/** What startup storage opened: the encrypted repository, or memory-only on the web. */
export type StorageHandle = { kind: 'encrypted'; repo: SqliteRepository } | { kind: 'web' };

interface DocRow {
  id: string;
  json: string;
}

function parseRow(row: DocRow): DocumentRecord | undefined {
  try {
    const parsed = DocumentRecord.safeParse(JSON.parse(row.json));
    return parsed.success && parsed.data.id === row.id ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function createSqliteRepository(db: SqlDb, files: PageFileStore): Promise<SqliteRepository> {
  await db.exec(SCHEMA);
  let skippedIds: string[] = [];

  const write = async (doc: DocumentRecord) => {
    await db.run('INSERT OR REPLACE INTO documents (id, json, updated_at) VALUES (?, ?, ?)', [
      doc.id,
      JSON.stringify(doc),
      doc.updatedAt,
    ]);
  };

  const repo: SqliteRepository = {
    get skippedIds() {
      return skippedIds;
    },

    async list() {
      const rows = await db.all<DocRow>('SELECT id, json FROM documents ORDER BY updated_at DESC');
      const docs: DocumentRecord[] = [];
      skippedIds = [];
      for (const row of rows) {
        const doc = parseRow(row);
        if (doc) docs.push(doc);
        else skippedIds.push(row.id);
      }
      return docs;
    },

    async get(id) {
      const [row] = await db.all<DocRow>('SELECT id, json FROM documents WHERE id = ?', [id]);
      return row ? parseRow(row) : undefined;
    },

    async save(doc) {
      const pages = await files.importPages(doc.id, doc.pages);
      const stored = pages === doc.pages ? doc : { ...doc, pages };
      await write(stored);
      return stored;
    },

    async rename(id, title) {
      const doc = await repo.get(id);
      if (!doc) return;
      await write({ ...doc, title, updatedAt: new Date().toISOString() });
    },

    async delete(id) {
      await db.run('DELETE FROM documents WHERE id = ?', [id]);
      await files.removeDocument(id);
    },

    async eraseAll() {
      await db.run('DELETE FROM documents');
      await files.removeAll();
      skippedIds = [];
    },

    async getSettings() {
      const rows = await db.all<{ key: string; value: string | null }>('SELECT key, value FROM settings');
      const out: Record<string, string> = {};
      for (const r of rows) if (r.value !== null) out[r.key] = r.value;
      return out;
    },

    async setSetting(key, value) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    },
  };
  return repo;
}

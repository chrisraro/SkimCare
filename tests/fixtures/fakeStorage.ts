/**
 * In-memory stand-ins for the SQLCipher database and the page-file folder.
 * The fake DB understands exactly the statements src/db/sqliteRepository.ts issues
 * and throws on anything else, so a new query cannot silently go untested.
 */
import type { PageFileStore, SqlDb, SqlParam } from '@/db/adapter';
import type { DocumentRecord } from '@/domain/schema';

export class FakeDb implements SqlDb {
  docs = new Map<string, { id: string; json: string; updated_at: string | null }>();
  settings = new Map<string, string>();
  schemaApplied = false;

  async exec(sql: string) {
    if (!/CREATE TABLE IF NOT EXISTS documents/.test(sql)) throw new Error(`FakeDb: unexpected exec ${sql}`);
    this.schemaApplied = true;
  }

  async run(sql: string, params: SqlParam[] = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('INSERT OR REPLACE INTO documents')) {
      const [id, json, updated_at] = params as [string, string, string];
      this.docs.set(id, { id, json, updated_at });
    } else if (s.startsWith('INSERT OR REPLACE INTO settings')) {
      const [key, value] = params as [string, string];
      this.settings.set(key, value);
    } else if (s === 'DELETE FROM documents WHERE id = ?') {
      this.docs.delete(params[0] as string);
    } else if (s === 'DELETE FROM documents') {
      this.docs.clear();
    } else {
      throw new Error(`FakeDb: unexpected run ${s}`);
    }
  }

  async all<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s === 'SELECT id, json FROM documents ORDER BY updated_at DESC') {
      return [...this.docs.values()]
        .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
        .map(({ id, json }) => ({ id, json }) as T);
    }
    if (s === 'SELECT id, json FROM documents WHERE id = ?') {
      const row = this.docs.get(params[0] as string);
      return row ? [{ id: row.id, json: row.json } as T] : [];
    }
    if (s === 'SELECT key, value FROM settings') {
      return [...this.settings.entries()].map(([key, value]) => ({ key, value }) as T);
    }
    throw new Error(`FakeDb: unexpected query ${s}`);
  }
}

/** Page files keyed by document id; "copies" any non-private URI into private://<id>/. */
export class FakeFiles implements PageFileStore {
  byDoc = new Map<string, string[]>();
  removed: string[] = [];
  removedAll = 0;

  async importPages(docId: string, pages: DocumentRecord['pages']) {
    const prefix = `private://${docId}/`;
    if (!pages.some((p) => p.uri && !p.uri.startsWith(prefix))) return pages;
    const files = this.byDoc.get(docId) ?? [];
    const out = pages.map((p) => {
      if (!p.uri || p.uri.startsWith(prefix)) return p;
      const uri = `${prefix}page-${p.number}.jpg`;
      if (!files.includes(uri)) files.push(uri);
      return { ...p, uri };
    });
    this.byDoc.set(docId, files);
    return out;
  }

  async removeDocument(docId: string) {
    this.removed.push(docId);
    this.byDoc.delete(docId);
  }

  async removeAll() {
    this.removedAll++;
    this.byDoc.clear();
  }
}

export function makeDoc(id: string, overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id,
    title: `Review ${id}`,
    type: 'service_agreement',
    language: 'en',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ocrRevision: 0,
    analysisStale: false,
    pages: [
      {
        number: 1,
        uri: `file:///cache/ImagePicker/${id}-1.jpg`,
        blocks: [
          {
            id: 'p1_b1',
            page: 1,
            text: 'Fictional sample clause.',
            originalText: 'Fictional sample clause.',
            confidence: 0.95,
            bbox: { x: 0, y: 0, w: 1, h: 1 },
            critical: false,
          },
        ],
      },
    ],
    ...overrides,
  };
}

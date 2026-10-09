import { beforeEach, describe, expect, it } from '@jest/globals';
import { createSqliteRepository, type SqliteRepository } from '@/db/sqliteRepository';
import { FakeDb, FakeFiles, makeDoc } from './fixtures/fakeStorage';

describe('SQLite document repository', () => {
  let db: FakeDb;
  let files: FakeFiles;
  let repo: SqliteRepository;

  beforeEach(async () => {
    db = new FakeDb();
    files = new FakeFiles();
    repo = await createSqliteRepository(db, files);
  });

  it('creates the schema on open', () => {
    expect(db.schemaApplied).toBe(true);
  });

  it('saves, gets and lists records, newest first', async () => {
    await repo.save(makeDoc('a', { updatedAt: '2026-10-01T00:00:00.000Z' }));
    await repo.save(makeDoc('b', { updatedAt: '2026-10-05T00:00:00.000Z' }));
    expect((await repo.list()).map((d) => d.id)).toEqual(['b', 'a']);
    expect((await repo.get('a'))?.title).toBe('Review a');
    expect(await repo.get('missing')).toBeUndefined();
  });

  it('copies page images into private storage and rewrites the page URI', async () => {
    const stored = await repo.save(makeDoc('a'));
    expect(stored.pages[0]?.uri).toBe('private://a/page-1.jpg');
    expect((await repo.get('a'))?.pages[0]?.uri).toBe('private://a/page-1.jpg');
    // Saving again does not copy again.
    const again = await repo.save(stored);
    expect(again).toBe(stored);
    expect(files.byDoc.get('a')).toEqual(['private://a/page-1.jpg']);
  });

  it('keeps pages without an image (PDF text) as they are', async () => {
    const doc = makeDoc('pdf');
    doc.pages[0]!.uri = undefined;
    const stored = await repo.save(doc);
    expect(stored).toBe(doc);
    expect(files.byDoc.has('pdf')).toBe(false);
  });

  it('renames and bumps updatedAt', async () => {
    await repo.save(makeDoc('a'));
    await repo.rename('a', 'Lease draft');
    const doc = await repo.get('a');
    expect(doc?.title).toBe('Lease draft');
    expect(doc?.updatedAt).not.toBe('2026-10-01T00:00:00.000Z');
    await expect(repo.rename('missing', 'x')).resolves.toBeUndefined();
  });

  it('delete removes the row and the page files of that document only', async () => {
    await repo.save(makeDoc('a'));
    await repo.save(makeDoc('b'));
    await repo.delete('a');
    expect(await repo.get('a')).toBeUndefined();
    expect(files.removed).toEqual(['a']);
    expect(files.byDoc.has('a')).toBe(false);
    expect(files.byDoc.has('b')).toBe(true);
  });

  it('eraseAll removes every row and every page file, but keeps settings', async () => {
    await repo.save(makeDoc('a'));
    await repo.save(makeDoc('b'));
    await repo.setSetting('locale', 'fil');
    await repo.eraseAll();
    expect(await repo.list()).toEqual([]);
    expect(files.removedAll).toBe(1);
    expect(files.byDoc.size).toBe(0);
    expect(await repo.getSettings()).toEqual({ locale: 'fil' });
  });

  it('skips rows that are not valid JSON or fail the schema, without crashing', async () => {
    await repo.save(makeDoc('good'));
    db.docs.set('broken', { id: 'broken', json: '{not json', updated_at: '2026-10-09' });
    db.docs.set('wrong', { id: 'wrong', json: JSON.stringify({ id: 'wrong', title: 3 }), updated_at: '2026-10-08' });
    db.docs.set('swapped', { id: 'swapped', json: JSON.stringify(makeDoc('other')), updated_at: '2026-10-07' });
    const docs = await repo.list();
    expect(docs.map((d) => d.id)).toEqual(['good']);
    expect([...repo.skippedIds].sort()).toEqual(['broken', 'swapped', 'wrong']);
    expect(await repo.get('broken')).toBeUndefined();
    // Unreadable rows are left in place (not destroyed) until the vault is erased.
    expect(db.docs.has('broken')).toBe(true);
  });

  it('round-trips settings', async () => {
    await repo.setSetting('locale', 'fil');
    await repo.setSetting('onboarded', '1');
    await repo.setSetting('locale', 'en');
    expect(await repo.getSettings()).toEqual({ locale: 'en', onboarded: '1' });
  });
});

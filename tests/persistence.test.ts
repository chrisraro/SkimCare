import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReadinessReport } from '@/ai/engines';
import { createSqliteRepository, type SqliteRepository } from '@/db/sqliteRepository';
import { useDocuments } from '@/features/documents/store';
import { useSettings } from '@/features/settings/store';
import { startPersistence, type Persistence } from '@/features/storage/persistence';
import { withStorageStatus } from '@/features/storage/readiness';
import { useStorageStatus } from '@/features/storage/store';
import { FakeDb, FakeFiles, makeDoc } from './fixtures/fakeStorage';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('store persistence', () => {
  let db: FakeDb;
  let files: FakeFiles;
  let repo: SqliteRepository;
  let p: Persistence | undefined;

  const start = () => startPersistence(async () => ({ kind: 'encrypted' as const, repo }), { debounceMs: 10 });

  beforeEach(async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    useDocuments.setState({ byId: {}, order: [] });
    useSettings.setState({ locale: 'en', onboarded: false, offlineReady: null });
    useStorageStatus.setState({ status: 'pending' });
    db = new FakeDb();
    files = new FakeFiles();
    repo = await createSqliteRepository(db, files);
  });

  afterEach(() => {
    p?.stop();
    jest.restoreAllMocks();
    p = undefined;
  });

  it('hydrates reviews and settings before resolving', async () => {
    await repo.save(makeDoc('old', { updatedAt: '2026-10-01T00:00:00.000Z' }));
    await repo.save(makeDoc('new', { updatedAt: '2026-10-03T00:00:00.000Z' }));
    await repo.setSetting('locale', 'fil');
    await repo.setSetting('onboarded', '1');

    p = await start();
    expect(useStorageStatus.getState().status).toBe('encrypted');
    expect(useDocuments.getState().order).toEqual(['new', 'old']);
    expect(useDocuments.getState().byId.old?.pages[0]?.uri).toBe('private://old/page-1.jpg');
    expect(useSettings.getState()).toMatchObject({ locale: 'fil', onboarded: true });
  });

  it('ignores an unknown stored locale', async () => {
    await repo.setSetting('locale', 'xx');
    p = await start();
    expect(useSettings.getState().locale).toBe('en');
  });

  it('writes a new review after the debounce and points it at the private page copy', async () => {
    p = await start();
    useDocuments.getState().save(makeDoc('a'));
    expect(db.docs.has('a')).toBe(false);
    await wait(40);
    await p.flush();
    expect(db.docs.has('a')).toBe(true);
    expect(useDocuments.getState().byId.a?.pages[0]?.uri).toBe('private://a/page-1.jpg');
  });

  it('writes only the records that changed, once per burst of edits', async () => {
    await repo.save(makeDoc('a'));
    await repo.save(makeDoc('b'));
    p = await start();
    const save = jest.spyOn(repo, 'save');
    useDocuments.getState().rename('a', 'One');
    useDocuments.getState().rename('a', 'Two');
    await wait(40);
    await p.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].id).toBe('a');
    expect((await repo.get('a'))?.title).toBe('Two');
  });

  it('deletes a removed review with its files, and erases the vault when none are left', async () => {
    await repo.save(makeDoc('a'));
    await repo.save(makeDoc('b'));
    db.docs.set('unreadable', { id: 'unreadable', json: '{', updated_at: null });
    p = await start();

    useDocuments.getState().remove('a');
    await p.flush();
    expect(db.docs.has('a')).toBe(false);
    expect(files.removed).toEqual(['a']);

    useDocuments.getState().eraseAll();
    await p.flush();
    expect(db.docs.size).toBe(0);
    expect(files.removedAll).toBe(1);
  });

  it('persists locale and onboarding changes', async () => {
    p = await start();
    useSettings.getState().setLocale('fil');
    useSettings.getState().completeOnboarding();
    await p.flush();
    expect(await repo.getSettings()).toEqual({ locale: 'fil', onboarded: '1' });
  });

  it('keeps a failed write pending and retries it on the next flush', async () => {
    p = await start();
    const save = jest.spyOn(repo, 'save').mockRejectedValueOnce(new Error('disk full'));
    useDocuments.getState().save(makeDoc('a'));
    await p.flush();
    expect(db.docs.has('a')).toBe(false);
    await p.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(db.docs.has('a')).toBe(true);
  });

  it('keeps working in memory when encrypted storage cannot open', async () => {
    p = await startPersistence(async () => {
      throw new Error('SQLCipher is not available in this build.');
    });
    expect(useStorageStatus.getState().status).toBe('unavailable');
    useDocuments.getState().save(makeDoc('a'));
    expect(useDocuments.getState().order).toEqual(['a']);
    await expect(p.flush()).resolves.toBeUndefined();
  });

  it('on the web, reviews stay in memory and nothing is written', async () => {
    p = await startPersistence(async () => ({ kind: 'web' }));
    expect(useStorageStatus.getState().status).toBe('web');
    useDocuments.getState().save(makeDoc('a'));
    await p.flush();
    expect(db.docs.size).toBe(0);
  });

  it('stops writing after stop()', async () => {
    p = await start();
    p.stop();
    useDocuments.getState().save(makeDoc('a'));
    await wait(40);
    expect(db.docs.size).toBe(0);
  });
});

describe('readiness storage check', () => {
  const report: ReadinessReport = {
    offlineReady: true,
    checks: [{ id: 'storage', label: 'Private storage', status: 'pass', detail: '3000 MB free.' }],
  };

  it('says reviews are encrypted when the database opened', () => {
    const r = withStorageStatus(report, 'encrypted');
    expect(r.offlineReady).toBe(true);
    expect(r.checks[0]).toMatchObject({ status: 'pass' });
    expect(r.checks[0]?.detail).toContain('encrypted database');
  });

  it('fails the check and is not offline-ready when storage could not open', () => {
    const r = withStorageStatus(report, 'unavailable');
    expect(r.offlineReady).toBe(false);
    expect(r.checks[0]?.status).toBe('fail');
  });

  it('warns on the web', () => {
    const r = withStorageStatus({ ...report, offlineReady: false }, 'web');
    expect(r.checks[0]).toMatchObject({ status: 'warn' });
    expect(r.checks[0]?.detail).toContain('close the tab');
  });
});

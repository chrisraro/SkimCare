/**
 * Connects the in-memory stores to encrypted storage (Milestone 4).
 *
 * Started explicitly from the root layout (`initPersistence(openStorage)`), never
 * at module import, so tests and screens can use the stores in memory.
 *  1. Open storage. On failure, keep working in memory (status `unavailable`).
 *  2. Hydrate useDocuments and useSettings (locale, onboarded, clauseSorter).
 *  3. Subscribe: document changes are written after a short debounce, only the
 *     records that changed; removed records are deleted with their page files.
 *     When no review is left, the whole vault is erased (including unreadable rows).
 *
 * This module does not import device APIs; the opener is injected.
 */
import type { DocumentRecord } from '@/domain/schema';
import type { StorageHandle, SqliteRepository } from '@/db/sqliteRepository';
import { useDocuments } from '@/features/documents/store';
import { useSettings } from '@/features/settings/store';
import { STRINGS, type Locale } from '@/i18n/strings';
import { useStorageStatus } from './store';

export interface PersistenceOptions {
  debounceMs?: number;
}

export interface Persistence {
  /** Write any pending changes now (tests, and before a risky operation). */
  flush(): Promise<void>;
  stop(): void;
}

const NOOP: Persistence = { flush: async () => undefined, stop: () => undefined };

function warn(what: string) {
  // Never include document content, ids or keys in logs.
  if (__DEV__) console.warn(`[storage] ${what}`);
}

const isLocale = (v: string | undefined): v is Locale => v !== undefined && v in STRINGS;

export async function startPersistence(
  open: () => Promise<StorageHandle>,
  { debounceMs = 300 }: PersistenceOptions = {},
): Promise<Persistence> {
  let handle: StorageHandle;
  try {
    handle = await open();
  } catch {
    warn('encrypted storage could not open; keeping reviews in memory');
    useStorageStatus.setState({ status: 'unavailable' });
    return NOOP;
  }
  if (handle.kind === 'web') {
    useStorageStatus.setState({ status: 'web' });
    return NOOP;
  }
  const repo = handle.repo;

  try {
    await hydrate(repo);
  } catch {
    warn('stored reviews could not be read; keeping reviews in memory');
    useStorageStatus.setState({ status: 'unavailable' });
    return NOOP;
  }
  useStorageStatus.setState({ status: 'encrypted' });

  /** Last version of each record known to be in the database. */
  const persisted = new Map<string, DocumentRecord>(Object.entries(useDocuments.getState().byId));
  let queue: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task).catch(() => warn('a write failed; it will be retried on the next change'));
    return queue;
  };

  const syncDocuments = async () => {
    const { byId } = useDocuments.getState();
    const ids = Object.keys(byId);
    if (ids.length === 0 && persisted.size > 0) {
      await repo.eraseAll();
      persisted.clear();
      return;
    }
    for (const id of [...persisted.keys()]) {
      if (byId[id]) continue;
      await repo.delete(id);
      persisted.delete(id);
    }
    for (const id of ids) {
      const doc = byId[id]!;
      if (persisted.get(id) === doc) continue;
      const stored = await repo.save(doc);
      persisted.set(id, stored);
      // Point the in-memory record at the private page copies, unless it changed meanwhile.
      if (stored !== doc && useDocuments.getState().byId[id] === doc) {
        useDocuments.setState((s) => ({ byId: { ...s.byId, [id]: stored } }));
      }
    }
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    return enqueue(syncDocuments);
  };

  const unsubDocs = useDocuments.subscribe((state, prev) => {
    if (stopped || state.byId === prev.byId) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  });

  const unsubSettings = useSettings.subscribe((state, prev) => {
    if (stopped) return;
    if (state.locale !== prev.locale) void enqueue(() => repo.setSetting('locale', state.locale));
    if (state.onboarded !== prev.onboarded) void enqueue(() => repo.setSetting('onboarded', state.onboarded ? '1' : '0'));
    if (state.clauseSorter !== prev.clauseSorter) void enqueue(() => repo.setSetting('clauseSorter', state.clauseSorter ? '1' : '0'));
  });

  return {
    flush: async () => {
      await flush();
    },
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      unsubDocs();
      unsubSettings();
    },
  };
}

async function hydrate(repo: SqliteRepository) {
  const [docs, settings] = await Promise.all([repo.list(), repo.getSettings()]);
  if (repo.skippedIds.length) warn(`${repo.skippedIds.length} stored review(s) could not be read and are hidden`);

  useDocuments.setState((s) => {
    const byId: Record<string, DocumentRecord> = {};
    for (const d of docs) byId[d.id] = d;
    // Anything created in memory before hydration finished wins over the stored copy.
    Object.assign(byId, s.byId);
    const order = [...s.order, ...docs.map((d) => d.id).filter((id) => !s.byId[id])];
    return { byId, order };
  });

  const patch: { locale?: Locale; onboarded?: boolean; clauseSorter?: boolean } = {};
  if (isLocale(settings.locale)) patch.locale = settings.locale;
  if (settings.onboarded === '1') patch.onboarded = true;
  if (settings.clauseSorter === '0') patch.clauseSorter = false;
  if (Object.keys(patch).length) useSettings.setState(patch);
}

let started: Promise<Persistence> | undefined;

/** Idempotent app entry point; resolves once the stores are hydrated (never rejects). */
export function initPersistence(open: () => Promise<StorageHandle>): Promise<Persistence> {
  started ??= startPersistence(open).catch(() => {
    useStorageStatus.setState({ status: 'unavailable' });
    return NOOP;
  });
  return started;
}

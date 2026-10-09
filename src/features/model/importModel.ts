/**
 * In-app model import (Android): the user picks a GGUF they already copied to
 * the phone (USB, Files, or a one-time download), and we copy it into the
 * app-private models folder that `llamaRuntime.modelFile()` reads from.
 *
 * - The picker returns a `content://` URI (`copyToCacheDirectory: false`), so
 *   there is only one copy of the ~380 MB file: picked source → models folder.
 * - The copy lands under a temporary `.part` name, is checked against the
 *   pinned size and MD5 natively (never read into JS), and only then replaces
 *   the real file name. A mismatching copy is deleted.
 * - Nothing is uploaded and no file content is logged.
 */
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { releaseModel } from '@/ai/llm/llamaRuntime';
import { MODEL_CANDIDATES, type ModelSpec } from '@/ai/llm/models';

export type ImportPhase = 'picking' | 'copying' | 'verifying' | 'done' | 'failed' | 'canceled';

export type ImportResult =
  | { status: 'done'; spec: ModelSpec }
  | { status: 'canceled' }
  | { status: 'failed'; message: string };

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Extra room left free after the copy so the phone can still save reviews. */
const STORAGE_MARGIN_BYTES = 200 * 1024 * 1024;

/** Downloads often get renamed "name (1).gguf" or "name-1.gguf"; compare without that suffix. */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\(\d+\)(?=\.gguf$)/, '')
    .replace(/-\d+(?=\.gguf$)/, '');
}

export type Validation = { ok: true; spec: ModelSpec } | { ok: false; message: string };

/** Match a picked file to a pinned model by name and size. */
export function validatePickedModel(name: string, sizeBytes: number | undefined, specs: readonly ModelSpec[] = MODEL_CANDIDATES): Validation {
  const normalized = normalizeName(name);
  const byName = specs.find((s) => s.fileName.toLowerCase() === normalized);
  if (!byName) {
    const bySize = sizeBytes !== undefined ? specs.find((s) => s.sizeBytes === sizeBytes) : undefined;
    if (bySize) {
      return { ok: false, message: `This file has the size of ${bySize.fileName} but a different name. Pick the original file named ${bySize.fileName}.` };
    }
    return {
      ok: false,
      message: `"${name}" is not a model this app can use. Pick ${specs.filter((s) => s.md5).map((s) => s.fileName).join(' or ')}.`,
    };
  }
  if (sizeBytes !== undefined && sizeBytes !== byName.sizeBytes) {
    return {
      ok: false,
      message: `This file is ${mb(sizeBytes)} but ${byName.name} ${byName.quantization} should be ${mb(byName.sizeBytes)}. The download may be incomplete — copy it again.`,
    };
  }
  if (!byName.md5) {
    return { ok: false, message: `${byName.name} ${byName.quantization} cannot be checked on this phone yet, so it cannot be imported.` };
  }
  return { ok: true, spec: byName };
}

function modelsDir(): Directory {
  return new Directory(Paths.document, 'models');
}

function safeDelete(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Best effort: a leftover .part file is never loaded (readiness looks for the exact name).
  }
}

function errorMessage(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/picking in progress|different document picking/i.test(text)) {
    return 'A file picker is already open. Close it and try again.';
  }
  return text || 'Unknown error';
}

/**
 * Pick → validate → copy → verify MD5 → move into place.
 * `onPhase` reports progress for the UI; it never receives file content.
 */
export async function importModel(onPhase: (phase: ImportPhase) => void = () => {}): Promise<ImportResult> {
  const fail = (message: string): ImportResult => {
    onPhase('failed');
    return { status: 'failed', message };
  };

  onPhase('picking');
  let picked: DocumentPicker.DocumentPickerResult;
  try {
    // GGUF has no registered MIME type, so allow any file and validate it ourselves.
    picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: false, multiple: false });
  } catch (e) {
    return fail(errorMessage(e));
  }
  const asset = picked.canceled ? undefined : picked.assets?.[0];
  if (!asset) {
    onPhase('canceled');
    return { status: 'canceled' };
  }

  const check = validatePickedModel(asset.name, asset.size);
  if (!check.ok) return fail(check.message);
  const spec = check.spec;

  const free = Paths.availableDiskSpace;
  if (typeof free === 'number' && free < spec.sizeBytes + STORAGE_MARGIN_BYTES) {
    return fail(`Not enough free space: the model needs about ${mb(spec.sizeBytes + STORAGE_MARGIN_BYTES)} and the phone has ${mb(free)} free.`);
  }

  const dir = modelsDir();
  const part = new File(dir, `${spec.fileName}.part`);
  const target = new File(dir, spec.fileName);

  onPhase('copying');
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    safeDelete(part);
    await new File(asset.uri).copy(part);
  } catch (e) {
    safeDelete(part);
    return fail(`Could not copy the file: ${errorMessage(e)}`);
  }

  onPhase('verifying');
  // The native MD5 call is synchronous; yield once so the "Checking" state can render first.
  await new Promise((r) => setTimeout(r, 50));
  try {
    const info = part.info({ md5: true });
    if (info.size !== spec.sizeBytes) {
      safeDelete(part);
      return fail(`The copied file is ${mb(info.size ?? 0)}, expected ${mb(spec.sizeBytes)}. The copy did not finish — try again.`);
    }
    if (!info.md5 || info.md5.toLowerCase() !== spec.md5) {
      safeDelete(part);
      return fail(`This file does not match ${spec.name} ${spec.quantization} (checksum differs). It is damaged or a different model, so it was removed.`);
    }
  } catch (e) {
    safeDelete(part);
    return fail(`Could not check the file: ${errorMessage(e)}`);
  }

  try {
    // A loaded model may be the file we are about to replace.
    await releaseModel();
    await part.move(target, { overwrite: true });
  } catch (e) {
    safeDelete(part);
    return fail(`Could not install the file: ${errorMessage(e)}`);
  }

  onPhase('done');
  return { status: 'done', spec };
}

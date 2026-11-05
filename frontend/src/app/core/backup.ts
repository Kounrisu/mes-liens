import { LinkStore } from './link-store';
import { validateLibrary } from './library';
import {
  EVENT_TYPES,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  ExportFile,
  Link,
  LinkEvent,
  LinkKind,
} from './models';

export class ImportError extends Error {}

export async function exportAll(
  store: LinkStore,
  now = new Date().toISOString(),
): Promise<ExportFile> {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    links: await store.listLinks({ includeDeleted: true }),
    events: await store.listEvents(),
  };
}

export async function exportToJson(store: LinkStore, now?: string): Promise<string> {
  return JSON.stringify(await exportAll(store, now), null, 2);
}

/**
 * Importe un export JSON. Tout est validé AVANT la moindre écriture : un fichier invalide ne touche pas la base.
 * - 'replace' : la base devient identique au fichier.
 * - 'merge'   : le plus récent gagne par lien ; les événements absents sont ajoutés.
 */
export async function importFromJson(
  store: LinkStore,
  json: string,
  mode: 'replace' | 'merge' = 'replace',
): Promise<{ links: number; events: number }> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ImportError('Fichier JSON invalide.');
  }
  const file = validateExport(raw);
  if (mode === 'replace') await store.replaceAll(file.links, file.events);
  else await store.mergeAll(file.links, file.events);
  return { links: file.links.length, events: file.events.length };
}

function validateExport(raw: unknown): ExportFile {
  if (!isRecord(raw) || raw['format'] !== EXPORT_FORMAT)
    throw new ImportError("Ce fichier n'est pas un export mes-liens.");
  if (raw['version'] !== EXPORT_VERSION)
    throw new ImportError(`Version d'export non supportée : ${String(raw['version'])}.`);
  if (!Array.isArray(raw['links']) || !Array.isArray(raw['events']))
    throw new ImportError('Export incomplet.');

  const links = raw['links'].map((l, i) => validateLink(l, i));
  const events = raw['events'].map((e, i) => validateEvent(e, i));
  assertUnique(
    links.map((l) => l.id),
    'lien',
  );
  assertUnique(
    events.map((e) => e.id),
    'événement',
  );
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: String(raw['exportedAt'] ?? ''),
    links,
    events,
  };
}

function validateLink(v: unknown, i: number): Link {
  const where = `Lien #${i}`;
  if (!isRecord(v)) throw new ImportError(`${where} invalide.`);
  const str = (k: string) => reqString(v, k, where);
  const date = (k: string) => reqDate(v, k, where);
  const tags = v['tags'];
  if (v['favorite'] !== undefined && typeof v['favorite'] !== 'boolean')
    throw new ImportError(`${where} : favori invalide.`);
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string'))
    throw new ImportError(`${where} : tags invalides.`);
  const screenshotId = v['screenshotId'];
  if (screenshotId !== null && typeof screenshotId !== 'string')
    throw new ImportError(`${where} : screenshotId invalide.`);
  const deletedAt = v['deletedAt'];
  if (
    deletedAt !== null &&
    (typeof deletedAt !== 'string' || Number.isNaN(Date.parse(deletedAt)))
  ) {
    throw new ImportError(`${where} : deletedAt invalide.`);
  }
  return {
    id: str('id'),
    url: str('url'),
    title: reqString(v, 'title', where, true),
    domain: reqString(v, 'domain', where, true),
    tags: tags as string[],
    note: reqString(v, 'note', where, true),
    screenshotId: screenshotId as string | null,
    // Absents des exports faits avant l'existence des catégories : chaîne vide.
    category: optString(v, 'category', where),
    source: optString(v, 'source', where),
    focusRank: optRank(v, where),
    kind: optKind(v, where),
    parentId: optParent(v, where),
    ...(v['library'] !== undefined ? { library: validateLibrary(v['library']) } : {}),
    ...(v['favorite'] !== undefined ? { favorite: v['favorite'] as boolean } : {}),
    createdAt: date('createdAt'),
    updatedAt: date('updatedAt'),
    deletedAt: deletedAt as string | null,
  };
}

function validateEvent(v: unknown, i: number): LinkEvent {
  const where = `Événement #${i}`;
  if (!isRecord(v)) throw new ImportError(`${where} invalide.`);
  const type = reqString(v, 'type', where);
  if (!(EVENT_TYPES as readonly string[]).includes(type))
    throw new ImportError(`${where} : type inconnu « ${type} ».`);
  if (!isRecord(v['payload'])) throw new ImportError(`${where} : payload invalide.`);
  return {
    id: reqString(v, 'id', where),
    linkId: reqString(v, 'linkId', where),
    type: type as LinkEvent['type'],
    payload: v['payload'],
    at: reqDate(v, 'at', where),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqString(
  o: Record<string, unknown>,
  key: string,
  where: string,
  allowEmpty = false,
): string {
  const v = o[key];
  if (typeof v !== 'string' || (!allowEmpty && v === ''))
    throw new ImportError(`${where} : « ${key} » invalide.`);
  return v;
}

function optString(o: Record<string, unknown>, key: string, where: string): string {
  const v = o[key];
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ImportError(`${where} : « ${key} » invalide.`);
  return v;
}

function optRank(o: Record<string, unknown>, where: string): number | null {
  const v = o['focusRank'];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1)
    throw new ImportError(where + ' : « focusRank » doit être un entier positif.');
  return v;
}

function optKind(o: Record<string, unknown>, where: string): LinkKind {
  const v = o['kind'];
  if (v === undefined || v === null) return 'link';
  if (v !== 'link' && v !== 'site')
    throw new ImportError(where + ' : « kind » doit valoir link ou site.');
  return v;
}

function optParent(o: Record<string, unknown>, where: string): string | null {
  const v = o['parentId'];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || v === '') throw new ImportError(where + ' : « parentId » invalide.');
  return v;
}

function reqDate(o: Record<string, unknown>, key: string, where: string): string {
  const v = reqString(o, key, where);
  if (Number.isNaN(Date.parse(v)))
    throw new ImportError(`${where} : « ${key} » n'est pas une date.`);
  return v;
}

function assertUnique(ids: string[], what: string): void {
  if (new Set(ids).size !== ids.length) throw new ImportError(`Identifiants de ${what} en double.`);
}

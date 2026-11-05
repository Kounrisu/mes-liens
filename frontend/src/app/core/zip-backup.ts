import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from 'fflate';
import { normalizeCategory } from './catalog';
import { domainOf, normalizeUrl, parseTags } from './link-utils';
import { LinkStore } from './link-store';
import { ImportError } from './backup';
import { Link, LinkEvent, LinkKind } from './models';
import { checkHierarchy } from './sites';

/**
 * Archive ZIP « pour l'IA » : un fichier `links.json` lisible et modifiable, un `LISEZ-MOI.md` qui explique les règles,
 * et les captures d'écran dans `screenshots/`. On la donne à une IA (ou on l'édite à la main), puis on la réimporte.
 */
export const ZIP_FORMAT = 'mes-liens-zip';
export const ZIP_VERSION = 1;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // l'API refuse au-delà
const MAX_ENTRY_BYTES = 20 * 1024 * 1024; // un fichier du zip, une fois décompressé
const MAX_TOTAL_BYTES = 300 * 1024 * 1024; // protection contre une archive « bombe »
const MAX_ENTRIES = 20000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un lien tel qu'écrit dans links.json. Les champs optionnels absents à l'import = on garde la valeur actuelle. */
export interface ZipLink {
  id?: string;
  url: string;
  title?: string;
  category?: string;
  source?: string;
  tags?: string[];
  note?: string;
  kind?: LinkKind;
  parentId?: string | null;
  focusRank?: number | null;
  /** Chemin relatif d'une image dans l'archive (ex. screenshots/<id>.png), ou null pour retirer la capture. */
  screenshot?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** true : le lien est supprimé. */
  deleted?: boolean;
}

const EXT_BY_MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** Type réel d'une image d'après ses premiers octets (jamais d'après le nom). null = pas une image acceptée. */
export function sniffImage(b: Uint8Array): string | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(blob);
  });
}

const README = `# mes-liens — archive pour l'IA

Cette archive contient tes liens. Tu peux la donner à une IA (ou l'éditer à la main), puis la réimporter dans mes-liens
(page Administration → « Importer un ZIP »).

## Contenu
- \`links.json\` : tous les liens (le seul fichier à modifier).
- \`screenshots/\` : les captures d'écran (fichiers .png/.jpg/.webp/.gif), référencées par le champ \`screenshot\`.
- \`LISEZ-MOI.md\` : ce fichier.

## Champs d'un lien (links.json → "links")
| Champ | Règle |
|---|---|
| \`id\` | UUID. **Ne pas le changer** : il identifie le lien. Sans \`id\` (ou id qui n'est pas un UUID) = nouveau lien. |
| \`url\` | Obligatoire, http ou https uniquement. |
| \`title\` | Titre, 1000 caractères max. |
| \`category\` | Une seule catégorie, en minuscules (formation, manga, anime, utile, emploi, veille, autre… ou une nouvelle). Chaîne vide = non classé. |
| \`source\` | Site d'origine (Udemy, YouTube…), 100 caractères max. |
| \`tags\` | Liste d'étiquettes, minuscules, 50 max, 64 caractères chacune. |
| \`note\` | Texte libre, 20000 caractères max. |
| \`kind\` | \`link\` (lien ordinaire) ou \`site\` (une plateforme à laquelle on rattache des liens). |
| \`parentId\` | \`id\` du site auquel le lien est rattaché, ou null. Un site n'a pas de parent. |
| \`focusRank\` | Rang dans la page Focus (1 = en tête), ou null si le lien n'est pas dans le Focus. |
| \`screenshot\` | Chemin d'une image de l'archive, ou null pour retirer la capture. Une image de plus ≤ 5 Mo peut être ajoutée dans \`screenshots/\`. |
| \`createdAt\`, \`updatedAt\` | Dates ISO 8601. \`updatedAt\` est recalculé à l'import pour les liens modifiés. |
| \`deleted\` | \`true\` pour supprimer le lien. |

## Règles de l'import
- Un champ absent = la valeur actuelle est conservée (sauf pour un nouveau lien : valeurs vides).
- Un lien dont l'\`id\` existe et dont le contenu a changé est mis à jour (c'est la version importée qui gagne).
- Un lien absent de l'archive n'est **pas** supprimé, sauf si tu coches l'option correspondante au moment de l'import.
- L'import affiche un résumé (créés, modifiés, supprimés, erreurs) **avant** d'écrire quoi que ce soit ; une seule erreur annule tout.
- Garde \`format\` et \`version\` en tête de fichier : ils servent à vérifier que l'archive est bien la bonne.
`;

/** Construit l'archive. Les liens supprimés n'y figurent pas. */
export async function exportZip(store: LinkStore, now = new Date().toISOString()): Promise<Uint8Array> {
  const links = (await store.listLinks()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const files: Zippable = {};
  const entries: ZipLink[] = [];
  for (const l of links) {
    let screenshot: string | null = null;
    if (l.screenshotId) {
      const blob = await store.getScreenshot(l.screenshotId);
      const bytes = blob ? await blobBytes(blob) : null;
      const mime = bytes ? sniffImage(bytes) : null;
      if (bytes && mime) {
        screenshot = `screenshots/${l.screenshotId}.${EXT_BY_MIME[mime]}`;
        files[screenshot] = [bytes, { level: 0 }]; // déjà compressé
      }
    }
    entries.push({
      id: l.id,
      url: l.url,
      title: l.title,
      category: l.category,
      source: l.source,
      tags: l.tags,
      note: l.note,
      kind: l.kind,
      parentId: l.parentId,
      focusRank: l.focusRank,
      screenshot,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    });
  }
  files['links.json'] = strToU8(JSON.stringify({ format: ZIP_FORMAT, version: ZIP_VERSION, exportedAt: now, links: entries }, null, 2));
  files['LISEZ-MOI.md'] = strToU8(README);
  return zipSync(files, { level: 6 });
}

// ---------------------------------------------------------------------------------------------------------------------
// Import : analyse (aucune écriture) puis application.

export interface ZipChange {
  link: Link;
  before: Link | null;
  /** Nouvelle capture à enregistrer (id = link.screenshotId). */
  screenshot?: { bytes: Uint8Array; mime: string };
  fields: string[];
}

export interface ZipImportPlan {
  created: ZipChange[];
  updated: ZipChange[];
  /** Liens marqués deleted:true dans l'archive. */
  deleted: Link[];
  /** Liens actuels absents de l'archive (supprimés seulement si l'option est cochée à l'application). */
  missing: Link[];
  unchanged: number;
  errors: string[];
}

interface Parsed {
  entries: unknown[];
  files: Record<string, Uint8Array>;
  prefix: string;
}

function readArchive(bytes: Uint8Array): Parsed {
  let total = 0;
  let count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (++count > MAX_ENTRIES) throw new ImportError('Archive trop volumineuse (trop de fichiers).');
        if (f.name.endsWith('/')) return false;
        if (f.originalSize > MAX_ENTRY_BYTES) throw new ImportError(`« ${f.name} » dépasse ${MAX_ENTRY_BYTES / 1024 / 1024} Mo.`);
        total += f.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new ImportError('Archive trop volumineuse une fois décompressée.');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("Ce fichier n'est pas une archive ZIP lisible.");
  }
  const norm: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) norm[name.replace(/\\/g, '/').replace(/^\/+/, '')] = data;

  // links.json à la racine, ou dans un dossier unique (cas d'une archive refaite en zippant le dossier).
  const candidates = Object.keys(norm).filter((n) => n === 'links.json' || n.endsWith('/links.json')).sort((a, b) => a.split('/').length - b.split('/').length);
  const path = candidates[0];
  if (!path) throw new ImportError("Cette archive ne contient pas de fichier links.json.");
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(norm[path]));
  } catch {
    throw new ImportError('links.json est un JSON invalide.');
  }
  if (!isRecord(raw) || raw['format'] !== ZIP_FORMAT) throw new ImportError("links.json n'est pas un export mes-liens (format attendu : " + ZIP_FORMAT + ').');
  if (raw['version'] !== ZIP_VERSION) throw new ImportError(`Version d'archive non supportée : ${String(raw['version'])}.`);
  if (!Array.isArray(raw['links'])) throw new ImportError('links.json : la liste « links » est absente.');
  return { entries: raw['links'], files: norm, prefix: path.slice(0, path.length - 'links.json'.length) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * Lit l'archive et prépare les changements SANS rien écrire. Toutes les erreurs sont collectées (pas seulement la première) :
 * si `errors` n'est pas vide, l'application est refusée.
 */
export async function planZipImport(store: LinkStore, bytes: Uint8Array, now = new Date().toISOString()): Promise<ZipImportPlan> {
  const { entries, files, prefix } = readArchive(bytes);
  const current = await store.listLinks({ includeDeleted: true });
  const byId = new Map(current.map((l) => [l.id, l]));
  const plan: ZipImportPlan = { created: [], updated: [], deleted: [], missing: [], unchanged: 0, errors: [] };

  const seen = new Set<string>();
  const alias = new Map<string, string>(); // id d'origine non-UUID → id attribué (pour résoudre parentId)
  const finalIds: string[] = [];
  const staged: { e: Record<string, unknown>; where: string; id: string; existing: Link | undefined }[] = [];

  entries.forEach((e, i) => {
    if (!isRecord(e)) return void plan.errors.push(`Lien #${i + 1} : ce n'est pas un objet.`);
    const rawId = typeof e['id'] === 'string' ? e['id'].trim() : '';
    const existing = UUID.test(rawId) ? byId.get(rawId.toLowerCase()) ?? byId.get(rawId) : undefined;
    const id = UUID.test(rawId) ? (existing?.id ?? rawId.toLowerCase()) : crypto.randomUUID();
    if (rawId && !UUID.test(rawId)) alias.set(rawId, id);
    const where = `Lien #${i + 1}${typeof e['title'] === 'string' && e['title'] ? ` « ${e['title'].slice(0, 40)} »` : ''}`;
    if (seen.has(id)) return void plan.errors.push(`${where} : identifiant en double (${id}).`);
    seen.add(id);
    finalIds.push(id);
    staged.push({ e, where, id, existing });
  });

  // Vue finale (pour vérifier les rattachements) : liens actuels, remplacés au fur et à mesure par leur version importée.
  const view = new Map(current.filter((l) => l.deletedAt === null).map((l) => [l.id, l]));
  const pending: { change: ZipChange; where: string }[] = [];

  for (const { e, where, id, existing } of staged) {
    const err = (m: string) => plan.errors.push(`${where} : ${m}`);
    const str = (k: string, max: number): string | undefined => {
      const v = e[k];
      if (v === undefined) return undefined;
      if (typeof v !== 'string') return void err(`« ${k} » doit être un texte.`), undefined;
      if (v.length > max) return void err(`« ${k} » dépasse ${max} caractères.`), undefined;
      return v;
    };

    if (e['deleted'] === true) {
      if (existing && existing.deletedAt === null) plan.deleted.push(existing);
      view.delete(id);
      continue;
    }

    // url : obligatoire pour un nouveau lien ; pour un lien existant, absente = inchangée.
    let url = existing?.url ?? '';
    const rawUrl = str('url', 4096);
    if (rawUrl !== undefined) {
      if (existing && rawUrl === existing.url) url = existing.url;
      else {
        const n = normalizeUrl(rawUrl);
        if (!n) err(`adresse invalide (« ${rawUrl.slice(0, 60)} » : seules http et https sont acceptées).`);
        else url = n;
      }
    } else if (!existing) err('« url » est obligatoire pour un nouveau lien.');

    const title = str('title', 1000) ?? existing?.title ?? '';
    const note = str('note', 20000) ?? existing?.note ?? '';
    const sourceRaw = str('source', 100);
    const source = sourceRaw !== undefined ? sourceRaw.trim() : (existing?.source ?? '');
    const catRaw = str('category', 200);
    const category = catRaw !== undefined ? normalizeCategory(catRaw) : (existing?.category ?? '');

    let tags = existing?.tags ?? [];
    if (e['tags'] !== undefined) {
      if (!Array.isArray(e['tags']) || e['tags'].some((t) => typeof t !== 'string')) err('« tags » doit être une liste de textes.');
      else tags = parseTags((e['tags'] as string[]).join(','));
    }

    let kind: LinkKind = existing?.kind ?? 'link';
    if (e['kind'] !== undefined) {
      if (e['kind'] !== 'link' && e['kind'] !== 'site') err('« kind » doit valoir link ou site.');
      else kind = e['kind'];
    }

    let parentId = existing?.parentId ?? null;
    if (e['parentId'] !== undefined) {
      const p = e['parentId'];
      if (p === null || p === '') parentId = null;
      else if (typeof p !== 'string') err('« parentId » invalide.');
      else parentId = alias.get(p) ?? (UUID.test(p) ? p.toLowerCase() : (err(`« parentId » n'est pas un identifiant connu (${p.slice(0, 40)}).`), null));
    }

    let focusRank = existing?.focusRank ?? null;
    if (e['focusRank'] !== undefined) {
      const r = e['focusRank'];
      if (r === null) focusRank = null;
      else if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 100000) err('« focusRank » doit être un entier entre 1 et 100000, ou null.');
      else focusRank = r;
    }

    const createdAt = validDate(e['createdAt']) ?? existing?.createdAt ?? now;
    if (e['createdAt'] !== undefined && validDate(e['createdAt']) === undefined) err('« createdAt » n\'est pas une date ISO.');

    // Capture
    let screenshotId = existing?.screenshotId ?? null;
    let shot: ZipChange['screenshot'];
    if (e['screenshot'] !== undefined) {
      const s = e['screenshot'];
      if (s === null || s === '') screenshotId = null;
      else if (typeof s !== 'string') err('« screenshot » doit être un chemin ou null.');
      else {
        const name = s.replace(/\\/g, '/').replace(/^\/+/, '');
        if (name.split('/').includes('..')) err('« screenshot » : chemin interdit.');
        else {
          const base = (name.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
          const wantedId = UUID.test(base) ? base.toLowerCase() : null;
          if (wantedId && existing?.screenshotId === wantedId) screenshotId = wantedId; // inchangée
          else {
            const data = files[prefix + name] ?? files[name];
            if (!data) err(`capture « ${name} » introuvable dans l'archive.`);
            else if (data.length > MAX_IMAGE_BYTES) err(`capture « ${name} » : plus de 5 Mo.`);
            else {
              const mime = sniffImage(data);
              const ext = (name.split('.').pop() ?? '').toLowerCase();
              if (!mime || (MIME_BY_EXT[ext] && MIME_BY_EXT[ext] !== mime && !(ext === 'jpeg' && mime === 'image/jpeg'))) err(`« ${name} » n'est pas une image PNG, JPEG, WebP ou GIF valide.`);
              else {
                screenshotId = wantedId && !(await store.hasScreenshot(wantedId)) ? wantedId : crypto.randomUUID();
                shot = { bytes: data, mime };
              }
            }
          }
        }
      }
    }

    const next: Link = {
      id,
      url,
      title: title.trim() || domainOf(url) || url,
      domain: domainOf(url),
      tags,
      note: note.trim(),
      screenshotId,
      category,
      source,
      focusRank,
      kind,
      parentId: kind === 'site' ? null : parentId,
      createdAt,
      updatedAt: existing?.updatedAt ?? now,
      deletedAt: null,
    };
    view.set(id, next);

    if (!existing) {
      pending.push({ change: { link: next, before: null, screenshot: shot, fields: ['création'] }, where });
      continue;
    }
    const fields: string[] = [];
    if (existing.deletedAt !== null) fields.push('rétabli');
    if (next.url !== existing.url) fields.push('url');
    if (next.title !== existing.title) fields.push('titre');
    if (next.note !== existing.note) fields.push('note');
    if (next.category !== existing.category) fields.push('catégorie');
    if (next.source !== existing.source) fields.push('source');
    if (!sameTags(next.tags, existing.tags)) fields.push('étiquettes');
    if (next.kind !== existing.kind) fields.push('type');
    if (next.parentId !== existing.parentId) fields.push('site parent');
    if (next.focusRank !== existing.focusRank) fields.push('rang focus');
    if (next.screenshotId !== existing.screenshotId) fields.push('capture');
    if (fields.length === 0) plan.unchanged++;
    else pending.push({ change: { link: next, before: existing, screenshot: shot, fields }, where });
  }

  // Rattachements vérifiés sur la vue finale.
  const finalList = [...view.values()];
  for (const { change, where } of pending) {
    const l = change.link;
    if (l.parentId !== (change.before?.parentId ?? null) || l.kind !== (change.before?.kind ?? 'link') || !change.before) {
      const bad = checkHierarchy(finalList, l.id, l.kind, l.parentId);
      if (bad) plan.errors.push(`${where} : ${bad}`);
    }
    (change.before ? plan.updated : plan.created).push(change);
  }

  plan.missing = current.filter((l) => l.deletedAt === null && !seen.has(l.id));
  return plan;
}

export interface ZipImportResult {
  created: number;
  updated: number;
  deleted: number;
}

/** Applique un plan sans erreur. Écrit lien par lien (dirty marqué par le stockage → envoyé au serveur ensuite). */
export async function applyZipImport(
  store: LinkStore,
  plan: ZipImportPlan,
  opts: { deleteMissing: boolean },
  now = new Date().toISOString(),
): Promise<ZipImportResult> {
  if (plan.errors.length) throw new ImportError("L'archive contient des erreurs : rien n'a été importé.");
  const ev = (linkId: string, type: LinkEvent['type'], payload: Record<string, unknown>): LinkEvent => ({ id: crypto.randomUUID(), linkId, type, payload, at: now });
  const stamp = (prev: string) => new Date(Math.max(Date.parse(now), Date.parse(prev) + 1)).toISOString();

  for (const c of plan.created) {
    if (c.screenshot && c.link.screenshotId) await store.putScreenshot(c.link.screenshotId, new Blob([c.screenshot.bytes as BlobPart], { type: c.screenshot.mime }));
    await store.putLink({ ...c.link, createdAt: c.link.createdAt, updatedAt: now });
    await store.addEvent(ev(c.link.id, 'created', { url: c.link.url, via: 'zip' }));
    for (const t of c.link.tags) await store.addEvent(ev(c.link.id, 'tagged', { tag: t }));
    if (c.screenshot && c.link.screenshotId) await store.addEvent(ev(c.link.id, 'screenshot_added', { screenshotId: c.link.screenshotId }));
  }
  for (const c of plan.updated) {
    const before = c.before as Link;
    if (c.screenshot && c.link.screenshotId) await store.putScreenshot(c.link.screenshotId, new Blob([c.screenshot.bytes as BlobPart], { type: c.screenshot.mime }));
    await store.putLink({ ...c.link, updatedAt: stamp(before.updatedAt) });
    for (const t of c.link.tags.filter((t) => !before.tags.includes(t))) await store.addEvent(ev(c.link.id, 'tagged', { tag: t }));
    for (const t of before.tags.filter((t) => !c.link.tags.includes(t))) await store.addEvent(ev(c.link.id, 'untagged', { tag: t }));
    if (c.link.note !== before.note) await store.addEvent(ev(c.link.id, 'note_edited', { from: before.note, to: c.link.note }));
    if (c.screenshot && c.link.screenshotId) await store.addEvent(ev(c.link.id, 'screenshot_added', { screenshotId: c.link.screenshotId }));
  }
  const toDelete = [...plan.deleted, ...(opts.deleteMissing ? plan.missing : [])];
  for (const l of toDelete) await store.softDeleteLink(l.id, now);
  return { created: plan.created.length, updated: plan.updated.length, deleted: toDelete.length };
}

function validDate(v: unknown): string | undefined {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

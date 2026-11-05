import { Injectable, computed, signal } from '@angular/core';
import { ImportError, exportToJson, importFromJson } from './backup';
import { exportBookmarksHtml } from './export-html';
import {
  ZipImportPlan,
  ZipImportResult,
  applyZipImport,
  exportZip,
  planZipImport,
} from './zip-backup';
import { LinkStore } from './link-store';
import { detectSource, normalizeCategory } from './catalog';
import { planAdd, planMove, planRemove } from './focus';
import { domainOf } from './link-utils';
import { Link, LinkEvent, LinkKind } from './models';
import { checkHierarchy } from './sites';
import { LibraryData, libraryOf, validateLibrary, categoryWithin } from './library';

/** Tout ce qui se saisit sur un lien. `url` est déjà normalisé (http/https). */
export interface LinkFields {
  favorite?: boolean;
  library?: LibraryData;
  url: string;
  title: string;
  tags: string[];
  note: string;
  category: string;
  source: string;
  kind: LinkKind;
  parentId: string | null;
}

export interface NewLink extends LinkFields {
  screenshot: Blob | null;
}

/** Capture lors d'une modification : garder l'actuelle, la retirer, ou la remplacer. */
export type ScreenshotChange = 'keep' | 'remove' | Blob;

@Injectable({ providedIn: 'root' })
export class LinkService {
  private store?: LinkStore;
  private readonly urls = new Map<string, string>(); // screenshotId -> object URL
  private readonly loadingScreenshots = new Set<string>();

  readonly ready = signal(false);
  readonly links = signal<Link[]>([]);
  readonly screenshotUrls = signal<Record<string, string>>({});
  readonly count = computed(() => this.links().length);
  readonly activeLinks = computed(() => this.links().filter((l) => !libraryOf(l).archived));
  /** Incrémenté à chaque modification LOCALE (déclenche la synchro). Pas après une synchro. */
  readonly localChanges = signal(0);

  get storage(): LinkStore {
    return this.need();
  }

  async init(): Promise<void> {
    this.store = await LinkStore.open();
    await this.refresh();
    this.ready.set(true);
  }

  find(id: string): Link | undefined {
    return this.links().find((l) => l.id === id);
  }

  async add(n: NewLink): Promise<Link> {
    const store = this.need();
    const invalid = checkHierarchy(this.links(), null, n.kind, n.parentId);
    if (invalid) throw new Error(invalid); // avant toute écriture : rien n'est laissé à moitié fait
    const parent = n.parentId ? this.find(n.parentId) : undefined;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    let screenshotId: string | null = null;
    if (n.screenshot) {
      screenshotId = crypto.randomUUID();
      await store.putScreenshot(screenshotId, n.screenshot);
    }
    // Source et catégorie : ce que l'utilisateur a saisi, sinon celles du site parent, sinon ce qu'on déduit de l'adresse (Udemy → formation).
    const detected = detectSource(n.url);
    const link: Link = {
      id,
      url: n.url,
      title: n.title.trim() || domainOf(n.url) || n.url,
      domain: domainOf(n.url),
      tags: n.tags,
      note: n.note.trim(),
      screenshotId,
      category: normalizeCategory(n.category) || parent?.category || detected?.category || '',
      source: n.source.trim() || parent?.title || detected?.source || '',
      focusRank: null,
      favorite: n.favorite ?? false,
      kind: n.kind,
      parentId: n.kind === 'site' ? null : n.parentId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      library: validateLibrary(n.library),
    };
    await store.putLink(link);
    await store.addEvent(this.event(id, 'created', { url: n.url }, now));
    if (screenshotId)
      await store.addEvent(this.event(id, 'screenshot_added', { screenshotId }, now));
    await this.afterLocalChange();
    return link;
  }

  /**
   * Modifie tous les champs d'un lien. L'enregistrement est remplacé en entier (updatedAt = maintenant : le plus récent gagne).
   * Les changements d'étiquettes, de note et de capture sont aussi consignés dans le journal (ajout seul).
   */
  async update(id: string, f: LinkFields, shot: ScreenshotChange = 'keep'): Promise<Link> {
    const store = this.need();
    const before = await store.getLink(id);
    if (!before || before.deletedAt !== null)
      throw new Error('Lien introuvable (il a peut-être été supprimé sur un autre appareil).');
    const invalid = checkHierarchy(this.links(), id, f.kind, f.parentId);
    if (invalid) throw new Error(invalid);

    const now = new Date().toISOString();
    let screenshotId = before.screenshotId;
    let addedShot: string | null = null;
    if (shot === 'remove') screenshotId = null;
    else if (shot !== 'keep') {
      screenshotId = crypto.randomUUID();
      addedShot = screenshotId;
      await store.putScreenshot(screenshotId, shot);
    }

    const after: Link = {
      ...before,
      favorite: f.favorite ?? before.favorite,
      url: f.url,
      title: f.title.trim() || domainOf(f.url) || f.url,
      domain: domainOf(f.url),
      tags: f.tags,
      note: f.note.trim(),
      screenshotId,
      category: normalizeCategory(f.category),
      source: f.source.trim(),
      library: validateLibrary(f.library ?? before.library),
      kind: f.kind,
      parentId: f.kind === 'site' ? null : f.parentId,
      updatedAt: this.stampAfter(before.updatedAt),
    };
    await store.putLink(after);

    for (const t of after.tags.filter((t) => !before.tags.includes(t)))
      await store.addEvent(this.event(id, 'tagged', { tag: t }, now));
    for (const t of before.tags.filter((t) => !after.tags.includes(t)))
      await store.addEvent(this.event(id, 'untagged', { tag: t }, now));
    if (after.note !== before.note)
      await store.addEvent(
        this.event(id, 'note_edited', { from: before.note, to: after.note }, now),
      );
    if (addedShot)
      await store.addEvent(this.event(id, 'screenshot_added', { screenshotId: addedShot }, now));

    await this.afterLocalChange();
    return after;
  }

  // ---- page Focus ----

  async classifyMany(
    ids: readonly string[],
    patch: {
      category?: string;
      tags?: string[];
      removeTags?: string[];
      favorite?: boolean;
      collection?: string;
      library?: Partial<LibraryData>;
    },
  ): Promise<number> {
    const count = await this.need().mutateLinks(ids, (l) => {
      const lib = libraryOf(l);
      const library = validateLibrary({
        ...lib,
        ...patch.library,
        collections: patch.collection
          ? [...new Set([...lib.collections, patch.collection.trim()])]
          : lib.collections,
      });
      const tags = [...new Set([...l.tags, ...(patch.tags ?? [])])].filter(
        (tag) => !patch.removeTags?.includes(tag),
      );
      if (tags.length > 50) throw new Error('Un lien ne peut pas avoir plus de 50 étiquettes.');
      if (tags.some((t) => !t.trim() || t.length > 64))
        throw new Error('Étiquette invalide (64 caractères maximum).');
      if (patch.category !== undefined && normalizeCategory(patch.category).length > 200)
        throw new Error('Catégorie trop longue (200 caractères maximum).');
      return {
        ...l,
        ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
        category: patch.category === undefined ? l.category : normalizeCategory(patch.category),
        tags,
        library,
      };
    });
    if (count) await this.afterLocalChange();
    return count;
  }

  async renameClassification(kind: 'category' | 'tag', from: string, to: string): Promise<number> {
    const target = kind === 'category' ? normalizeCategory(to) : to.trim().toLowerCase();
    if (!from || !target || (kind === 'tag' && (target.length > 64 || /[,\n]/.test(target))))
      throw new Error('Choisis un nom valide.');
    if (kind === 'category' && from !== target && categoryWithin(target, from))
      throw new Error('Une catégorie ne peut pas être déplacée dans sa propre sous-catégorie.');
    const n = await this.need().mutateLinks(
      this.links().map((l) => l.id),
      (l) => {
        if (kind === 'tag')
          return l.tags.includes(from)
            ? { ...l, tags: [...new Set(l.tags.map((t) => (t === from ? target : t)))] }
            : l;
        if (!categoryWithin(l.category, from)) return l;
        const category = target + l.category.slice(from.length);
        if (category.length > 200)
          throw new Error('Chemin de catégorie trop long (200 caractères maximum).');
        return { ...l, category };
      },
    );
    if (n) await this.afterLocalChange();
    return n;
  }

  async addToFocus(id: string): Promise<void> {
    await this.applyRanks(planAdd(this.links(), id));
  }

  async removeFromFocus(id: string): Promise<void> {
    await this.applyRanks(planRemove(this.links(), id));
  }

  async moveInFocus(id: string, delta: -1 | 1): Promise<void> {
    await this.applyRanks(planMove(this.links(), id, delta));
  }

  /** Écrit les nouveaux rangs. Chaque lien modifié est remplacé en entier avec un updatedAt strictement plus récent (le plus récent gagne). */
  private async applyRanks(changes: Map<string, number | null>): Promise<void> {
    if (!changes.size) return;
    const store = this.need();
    for (const [id, rank] of changes) {
      const l = await store.getLink(id);
      if (!l || l.deletedAt !== null) continue;
      await store.putLink({ ...l, focusRank: rank, updatedAt: this.stampAfter(l.updatedAt) });
    }
    await this.afterLocalChange();
  }

  /** « Maintenant », mais toujours strictement après previous : deux modifications dans la même milliseconde ne doivent pas avoir le même updatedAt. */
  private stampAfter(previous: string): string {
    const now = Date.now();
    return new Date(Math.max(now, Date.parse(previous) + 1)).toISOString();
  }

  async remove(id: string): Promise<void> {
    await this.need().softDeleteLink(id, new Date().toISOString());
    await this.afterLocalChange();
  }

  /** Supprime plusieurs liens d'un coup (une seule mise à jour de l'écran et une seule synchro). Retourne le nombre réellement supprimé. */
  async removeMany(ids: readonly string[]): Promise<number> {
    const store = this.need();
    const now = new Date().toISOString();
    let n = 0;
    for (const id of new Set(ids)) if (await store.softDeleteLink(id, now)) n++;
    if (n) await this.afterLocalChange();
    return n;
  }

  async exportJson(): Promise<string> {
    return exportToJson(this.need());
  }

  async importJson(
    json: string,
    mode: 'replace' | 'merge',
  ): Promise<{ links: number; events: number }> {
    const r = await importFromJson(this.need(), json, mode);
    await this.afterLocalChange();
    return r;
  }

  /** Favoris au format HTML (importable par les navigateurs). */
  exportHtml(): string {
    return exportBookmarksHtml(this.links());
  }

  /** Archive ZIP pour l'IA : links.json + captures. */
  async exportZipBytes(): Promise<Uint8Array> {
    return exportZip(this.need());
  }

  /** Analyse une archive sans rien écrire. */
  async planZip(bytes: Uint8Array): Promise<ZipImportPlan> {
    return planZipImport(this.need(), bytes);
  }

  async applyZip(plan: ZipImportPlan, opts: { deleteMissing: boolean }): Promise<ZipImportResult> {
    const r = await applyZipImport(this.need(), plan, opts);
    await this.afterLocalChange();
    return r;
  }

  /** Recharge la liste depuis IndexedDB (après une synchro). */
  async reload(): Promise<void> {
    await this.refresh();
  }

  private event(
    linkId: string,
    type: LinkEvent['type'],
    payload: Record<string, unknown>,
    at: string,
  ): LinkEvent {
    return { id: crypto.randomUUID(), linkId, type, payload, at };
  }

  private async afterLocalChange(): Promise<void> {
    await this.refresh();
    this.localChanges.update((n) => n + 1);
  }

  private async refresh(): Promise<void> {
    const store = this.need();
    const links = await store.listLinks();
    this.links.set(links);
    const next = { ...this.screenshotUrls() };
    const used = new Set(links.map((l) => l.screenshotId));
    for (const [id, url] of this.urls)
      if (!used.has(id)) {
        URL.revokeObjectURL(url);
        this.urls.delete(id);
        delete next[id];
      }
    this.screenshotUrls.set(next);
  }

  async ensureScreenshot(id: string): Promise<void> {
    if (this.urls.has(id) || this.loadingScreenshots.has(id)) return;
    this.loadingScreenshots.add(id);
    try {
      const blob = await this.need().getScreenshot(id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.urls.set(id, url);
        this.screenshotUrls.update((s) => ({ ...s, [id]: url }));
      }
    } finally {
      this.loadingScreenshots.delete(id);
    }
  }

  private need(): LinkStore {
    if (!this.store) throw new Error('Stockage non initialisé');
    return this.store;
  }
}

export { ImportError };

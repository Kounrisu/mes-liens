import { Injectable, computed, signal } from '@angular/core';
import { ImportError, exportToJson, importFromJson } from './backup';
import { LinkStore } from './link-store';
import { detectSource, normalizeCategory } from './catalog';
import { planAdd, planMove, planRemove } from './focus';
import { domainOf } from './link-utils';
import { Link, LinkEvent } from './models';

/** Tout ce qui se saisit sur un lien. `url` est déjà normalisé (http/https). */
export interface LinkFields {
  url: string;
  title: string;
  tags: string[];
  note: string;
  category: string;
  source: string;
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

  readonly ready = signal(false);
  readonly links = signal<Link[]>([]);
  readonly screenshotUrls = signal<Record<string, string>>({});
  readonly count = computed(() => this.links().length);
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
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    let screenshotId: string | null = null;
    if (n.screenshot) {
      screenshotId = crypto.randomUUID();
      await store.putScreenshot(screenshotId, n.screenshot);
    }
    // Source et catégorie : ce que l'utilisateur a saisi, sinon ce qu'on déduit du site (Udemy → formation).
    const detected = detectSource(n.url);
    const link: Link = {
      id,
      url: n.url,
      title: n.title.trim() || domainOf(n.url) || n.url,
      domain: domainOf(n.url),
      tags: n.tags,
      note: n.note.trim(),
      screenshotId,
      category: normalizeCategory(n.category) || detected?.category || '',
      source: n.source.trim() || detected?.source || '',
      focusRank: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await store.putLink(link);
    await store.addEvent(this.event(id, 'created', { url: n.url }, now));
    if (screenshotId) await store.addEvent(this.event(id, 'screenshot_added', { screenshotId }, now));
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
    if (!before || before.deletedAt !== null) throw new Error('Lien introuvable (il a peut-être été supprimé sur un autre appareil).');

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
      url: f.url,
      title: f.title.trim() || domainOf(f.url) || f.url,
      domain: domainOf(f.url),
      tags: f.tags,
      note: f.note.trim(),
      screenshotId,
      category: normalizeCategory(f.category),
      source: f.source.trim(),
      updatedAt: this.stampAfter(before.updatedAt),
    };
    await store.putLink(after);

    for (const t of after.tags.filter((t) => !before.tags.includes(t))) await store.addEvent(this.event(id, 'tagged', { tag: t }, now));
    for (const t of before.tags.filter((t) => !after.tags.includes(t))) await store.addEvent(this.event(id, 'untagged', { tag: t }, now));
    if (after.note !== before.note) await store.addEvent(this.event(id, 'note_edited', { from: before.note, to: after.note }, now));
    if (addedShot) await store.addEvent(this.event(id, 'screenshot_added', { screenshotId: addedShot }, now));

    await this.afterLocalChange();
    return after;
  }

  // ---- page Focus ----

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

  async exportJson(): Promise<string> {
    return exportToJson(this.need());
  }

  async importJson(json: string, mode: 'replace' | 'merge'): Promise<{ links: number; events: number }> {
    const r = await importFromJson(this.need(), json, mode);
    await this.afterLocalChange();
    return r;
  }

  /** Recharge la liste depuis IndexedDB (après une synchro). */
  async reload(): Promise<void> {
    await this.refresh();
  }

  private event(linkId: string, type: LinkEvent['type'], payload: Record<string, unknown>, at: string): LinkEvent {
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
    for (const l of links) {
      if (l.screenshotId && !this.urls.has(l.screenshotId)) {
        const blob = await store.getScreenshot(l.screenshotId);
        if (blob) {
          const u = URL.createObjectURL(blob);
          this.urls.set(l.screenshotId, u);
          next[l.screenshotId] = u;
        }
      }
    }
    this.screenshotUrls.set(next);
  }

  private need(): LinkStore {
    if (!this.store) throw new Error('Stockage non initialisé');
    return this.store;
  }
}

export { ImportError };

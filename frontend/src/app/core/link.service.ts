import { Injectable, computed, signal } from '@angular/core';
import { ImportError, exportToJson, importFromJson } from './backup';
import { LinkStore } from './link-store';
import { domainOf } from './link-utils';
import { Link } from './models';

export interface NewLink {
  url: string; // déjà normalisé
  title: string;
  tags: string[];
  note: string;
  screenshot: Blob | null;
}

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

  async add(n: NewLink): Promise<Link> {
    const store = this.need();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    let screenshotId: string | null = null;
    if (n.screenshot) {
      screenshotId = crypto.randomUUID();
      await store.putScreenshot(screenshotId, n.screenshot);
    }
    const link: Link = {
      id,
      url: n.url,
      title: n.title.trim() || domainOf(n.url) || n.url,
      domain: domainOf(n.url),
      tags: n.tags,
      note: n.note.trim(),
      screenshotId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await store.putLink(link);
    await store.addEvent({ id: crypto.randomUUID(), linkId: id, type: 'created', payload: { url: n.url }, at: now });
    if (screenshotId) {
      await store.addEvent({ id: crypto.randomUUID(), linkId: id, type: 'screenshot_added', payload: { screenshotId }, at: now });
    }
    await this.refresh();
    this.localChanges.update((n) => n + 1);
    return link;
  }

  async remove(id: string): Promise<void> {
    await this.need().softDeleteLink(id, new Date().toISOString());
    await this.refresh();
    this.localChanges.update((n) => n + 1);
  }

  async exportJson(): Promise<string> {
    return exportToJson(this.need());
  }

  async importJson(json: string, mode: 'replace' | 'merge'): Promise<{ links: number; events: number }> {
    const r = await importFromJson(this.need(), json, mode);
    await this.refresh();
    this.localChanges.update((n) => n + 1);
    return r;
  }

  /** Recharge la liste depuis IndexedDB (après une synchro). */
  async reload(): Promise<void> {
    await this.refresh();
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

import { Injectable, effect, inject, signal } from '@angular/core';
import { LinkService } from './link.service';
import { SyncService } from './sync.service';

export interface Insight {
  linkId: string;
  url: string;
  status: string;
  httpStatus: number | null;
  title: string;
  description: string;
  finalUrl: string;
  screenshotId: string | null;
  checkedAt: string | null;
  capturedAt: string | null;
}
export const HEALTH_LABELS: Record<string, string> = {
  pending: 'À vérifier',
  working: 'Accessible',
  redirected: 'Redirigé',
  login: 'Connexion nécessaire',
  blocked: 'Accès automatisé bloqué',
  unavailable: 'Indisponible temporairement',
  missing: 'Page peut-être supprimée',
  unsafe: 'Adresse non publique — vérification ignorée',
};
@Injectable({ providedIn: 'root' })
export class InsightsService {
  private readonly links = inject(LinkService);
  private readonly sync = inject(SyncService);
  readonly records = signal<Record<string, Insight>>({});
  readonly screenshots = signal<Record<string, string>>({});
  private pending = new Set<string>();
  constructor() {
    effect(() => {
      if (this.links.ready()) void this.restore();
    });
    effect(() => {
      if (this.sync.lastSyncAt()) void this.refresh();
    });
  }
  private async restore() {
    this.records.set(
      (await this.links.storage.getMeta<Record<string, Insight>>('library.insights')) ?? {},
    );
  }
  private async request(path: string, init: RequestInit = {}) {
    const cfg = await this.links.storage.getMeta<{ serverUrl: string; token: string }>(
      'sync.config',
    );
    if (!cfg) throw new Error('Connecte cet appareil au serveur pour vérifier les liens.');
    const r = await fetch(cfg.serverUrl + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { 'X-Api-Token': cfg.token } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new Error(
        r.status === 401
          ? 'Reconnexion au serveur nécessaire.'
          : `Vérification indisponible (${r.status}).`,
      );
    return r;
  }
  async refresh() {
    try {
      const list = (await (await this.request('/api/insights')).json()) as Insight[];
      const map = Object.fromEntries(list.map((i) => [i.linkId, i]));
      this.records.set(map);
      await this.links.storage.setMeta('library.insights', map);
    } catch {
      /* keep cached observations offline */
    }
  }
  async recheck(ids: string[]) {
    for (let n = 0; n < ids.length; n += 200)
      await this.request('/api/insights/recheck', {
        method: 'POST',
        body: JSON.stringify({ ids: ids.slice(n, n + 200) }),
      });
  }
  async loadScreenshot(id: string) {
    if (this.pending.has(id) || this.screenshots()[id]) return;
    this.pending.add(id);
    try {
      const store = this.links.storage;
      let blob = await store.getScreenshot(id);
      if (!blob) {
        blob = await (await this.request('/api/screenshots/' + id)).blob();
        await store.putScreenshotSynced(id, blob);
      }
      this.screenshots.update((s) => ({ ...s, [id]: URL.createObjectURL(blob!) }));
    } catch {
      /* manual fallback remains available */
    } finally {
      this.pending.delete(id);
    }
  }
}

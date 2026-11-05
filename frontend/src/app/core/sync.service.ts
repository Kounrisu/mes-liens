import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { LinkService } from './link.service';
import { META_CURSOR, SyncAuthError, SyncEngine, SyncNetworkError } from './sync';
import { HttpSyncApi, suggestedServerUrl, validateServerUrl } from './sync-api';

export type SyncStatus = 'unconfigured' | 'idle' | 'syncing' | 'offline' | 'auth-error' | 'error';

interface SyncConfig {
  serverUrl: string;
  token: string;
}

const META_CONFIG = 'sync.config';
const AUTO_SYNC_MS = 60_000;
const DEBOUNCE_MS = 1_500;

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly links = inject(LinkService);
  private engine?: SyncEngine;
  private timer?: ReturnType<typeof setTimeout>;

  readonly status = signal<SyncStatus>('unconfigured');
  readonly message = signal('');
  readonly lastSyncAt = signal<string | null>(null);
  readonly serverUrl = signal('');
  readonly pendingCount = signal(0);
  /** true pendant la recherche d'un accès automatique (évite d'afficher le guide de connexion une fraction de seconde). */
  readonly probing = signal(false);
  /** true : le serveur fournit lui-même la clé d'accès, ce navigateur n'a aucun jeton à saisir ni à conserver. */
  readonly gateway = signal(false);

  constructor() {
    let first = true;
    effect(() => {
      this.links.localChanges();
      if (first) {
        first = false;
        return;
      }
      untracked(() => this.schedule());
    });
  }

  async init(): Promise<void> {
    const store = this.links.storage;
    this.lastSyncAt.set((await store.getMeta<string>('sync.lastSyncAt')) ?? null);
    this.pendingCount.set((await store.listDirty()).length);
    const cfg = await store.getMeta<SyncConfig>(META_CONFIG);
    if (cfg) this.useConfig(cfg);
    else await this.tryGateway();

    window.addEventListener('online', () => void this.syncNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow();
    }, AUTO_SYNC_MS);
    void this.syncNow();
  }

  /**
   * Accès automatique : quand l'app est servie en HTTPS par son propre serveur, on demande à ce serveur si l'API répond SANS jeton
   * (il peut ajouter lui-même la clé devant l'API). Si oui, l'appareil se connecte seul, sans rien saisir ; sinon (401) le guide de
   * connexion manuelle s'affiche. La question posée est volontairement minuscule (aucune donnée n'est tirée pour ce test).
   * Retourne true si la connexion automatique est active.
   */
  async tryGateway(loc: { protocol: string; hostname: string; origin: string } = window.location, doFetch: typeof fetch = (...a) => fetch(...a)): Promise<boolean> {
    const origin = suggestedServerUrl(loc);
    if (!origin) return false; // développement local ou HTTP : pas d'accès automatique
    this.probing.set(true);
    try {
      const res = await doFetch(`${origin}/api/sync?since=9007199254740991`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      const cfg: SyncConfig = { serverUrl: origin, token: '' };
      await this.links.storage.setMeta(META_CONFIG, cfg);
      this.useConfig(cfg);
      return true;
    } catch {
      return false; // serveur injoignable : on reste sur le guide manuel, la prochaine ouverture réessaiera
    } finally {
      this.probing.set(false);
    }
  }

  /** Enregistre le serveur et le jeton, et lance une première synchro. Lance une Error lisible si l'URL est refusée. */
  async configure(serverUrl: string, token: string): Promise<void> {
    const url = validateServerUrl(serverUrl);
    if (token.trim().length < 32) throw new Error('Jeton trop court (32 caractères minimum).');
    const store = this.links.storage;
    const previous = await store.getMeta<SyncConfig>(META_CONFIG);
    if (previous && previous.serverUrl !== url) {
      // Autre serveur : son curseur n'a aucun sens ici, et il ne connaît encore rien de nos données.
      await store.deleteMeta(META_CURSOR);
      await store.markAllDirty();
    }
    const cfg = { serverUrl: url, token: token.trim() };
    await store.setMeta(META_CONFIG, cfg);
    this.useConfig(cfg);
    await this.syncNow();
  }

  async disconnect(): Promise<void> {
    await this.links.storage.deleteMeta(META_CONFIG);
    this.engine = undefined;
    this.serverUrl.set('');
    this.status.set('unconfigured');
    this.message.set('');
  }

  /** Synchronise bientôt (regroupe les modifications rapprochées). */
  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), DEBOUNCE_MS);
  }

  async syncNow(): Promise<void> {
    if (!this.engine) return;
    if (this.status() === 'auth-error') return; // inutile de marteler le serveur avec un mauvais jeton
    this.status.set('syncing');
    try {
      const r = await this.engine.sync();
      await this.links.reload();
      this.lastSyncAt.set(r.syncedAt);
      this.status.set('idle');
      this.message.set(r.rejected.length ? `${r.rejected.length} élément(s) refusé(s) par le serveur.` : '');
    } catch (e) {
      if (e instanceof SyncAuthError) {
        this.status.set('auth-error');
        this.message.set('Jeton refusé par le serveur. Vérifie-le puis reconnecte-toi.');
      } else if (e instanceof SyncNetworkError) {
        this.status.set('offline');
        this.message.set(navigator.onLine ? 'Serveur injoignable, nouvel essai automatique.' : 'Hors ligne : les modifications seront envoyées au retour du réseau.');
      } else {
        this.status.set('error');
        this.message.set('Erreur de synchronisation.');
      }
    } finally {
      this.pendingCount.set((await this.links.storage.listDirty()).length);
    }
  }

  private useConfig(cfg: SyncConfig): void {
    this.engine = new SyncEngine(this.links.storage, new HttpSyncApi(cfg.serverUrl, cfg.token));
    this.gateway.set(cfg.token === '');
    this.serverUrl.set(cfg.serverUrl);
    this.status.set('idle');
    this.message.set('');
  }
}

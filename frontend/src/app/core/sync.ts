import { DirtyEntry, LinkStore } from './link-store';
import { Link, LinkEvent } from './models';

export interface PullResult {
  cursor: number;
  head: number;
  links: Link[];
  events: LinkEvent[];
}

/** Ce que le moteur attend du serveur. Implémentation réelle : HttpSyncApi. */
export interface SyncApi {
  /** Upsert idempotent. Retourne la version qui fait foi côté serveur (la nôtre, ou une plus récente). */
  putLink(link: Link): Promise<Link>;
  /** Idempotent. */
  postEvent(event: LinkEvent): Promise<void>;
  putScreenshot(id: string, blob: Blob): Promise<void>;
  /** null si le serveur ne l'a pas (404). */
  getScreenshot(id: string): Promise<Blob | null>;
  pull(since: number): Promise<PullResult>;
}

/** Jeton refusé (401/403) : inutile de réessayer tant que la configuration n'est pas corrigée. */
export class SyncAuthError extends Error {}
/** Pas de réseau, délai dépassé, 5xx, 429 : on réessaiera plus tard, rien n'est perdu. */
export class SyncNetworkError extends Error {}
/** Le serveur refuse CET élément (4xx) : il reste à pousser, on continue avec les autres et on le signale. */
export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface SyncReport {
  pushed: { links: number; events: number; screenshots: number };
  pulled: { links: number; events: number; screenshots: number };
  /** Éléments refusés par le serveur (restent à pousser). */
  rejected: string[];
  /** true si le serveur avait été réinitialisé (curseur du futur) : tout a été repoussé. */
  serverReset: boolean;
  syncedAt: string;
}

export const META_CURSOR = 'sync.cursor';
export const META_LAST_SYNC = 'sync.lastSyncAt';

/**
 * Synchronisation bidirectionnelle. Règle : le plus récent gagne, sur l'enregistrement ENTIER (updatedAt).
 *  1. Pousse ce qui est marqué « à pousser » : captures d'abord (un lien ne référence jamais une image absente), puis liens, puis événements.
 *  2. Tire tout ce que le serveur a écrit depuis notre curseur (numéro attribué par le serveur, pas une date).
 * Chaque étape est idempotente : une coupure à n'importe quel moment est rattrapée à la synchro suivante.
 */
export class SyncEngine {
  private running: Promise<SyncReport> | null = null;

  constructor(
    private readonly store: LinkStore,
    private readonly api: SyncApi,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** Un seul passage à la fois : un appel pendant une synchro en cours reçoit le même résultat. */
  sync(): Promise<SyncReport> {
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<SyncReport> {
    const report: SyncReport = {
      pushed: { links: 0, events: 0, screenshots: 0 },
      pulled: { links: 0, events: 0, screenshots: 0 },
      rejected: [],
      serverReset: false,
      syncedAt: '',
    };

    await this.push(report);

    let since = (await this.store.getMeta<number>(META_CURSOR)) ?? 0;
    let res = await this.api.pull(since);
    if (since > res.head) {
      // Le serveur est « en retard » sur nous : base réinitialisée ou restaurée. On repart de zéro ET on repousse tout.
      report.serverReset = true;
      since = 0;
      res = await this.api.pull(0);
      await this.store.markAllDirty();
    }
    await this.applyPull(res, report);
    await this.store.setMeta(META_CURSOR, res.cursor);
    if (report.serverReset) await this.push(report);

    report.syncedAt = this.now();
    await this.store.setMeta(META_LAST_SYNC, report.syncedAt);
    return report;
  }

  // ---- poussée ----

  private async push(report: SyncReport): Promise<void> {
    const dirty = await this.store.listDirty();
    const order: Record<string, number> = { screenshot: 0, link: 1, event: 2 };
    dirty.sort((a, b) => order[a.kind] - order[b.kind]);
    for (const entry of dirty) {
      try {
        if (await this.pushOne(entry)) report.pushed[`${entry.kind}s` as 'links' | 'events' | 'screenshots']++;
      } catch (e) {
        if (e instanceof SyncHttpError) report.rejected.push(`${entry.kind} ${entry.id} : ${e.status} ${e.message}`);
        else throw e; // réseau / auth : on arrête, tout reste marqué
      }
    }
  }

  private async pushOne(entry: DirtyEntry): Promise<boolean> {
    switch (entry.kind) {
      case 'screenshot': {
        const blob = await this.store.getScreenshot(entry.id);
        if (!blob) break; // plus de données : rien à pousser
        await this.api.putScreenshot(entry.id, blob);
        break;
      }
      case 'link': {
        const link = await this.store.getLink(entry.id);
        if (!link) break;
        const authoritative = await this.api.putLink(link);
        // Le serveur a gardé une autre version que la nôtre (plus récente, ou à égalité de date : il garde la première arrivée).
        // On s'aligne sur lui, sauf si le lien a encore été modifié localement pendant l'envoi (il restera marqué).
        if (JSON.stringify(authoritative) !== JSON.stringify(link)) await this.store.adoptServerLink(link, authoritative);
        break;
      }
      case 'event': {
        const ev = await this.store.getEvent(entry.id);
        if (!ev) break;
        await this.api.postEvent(ev);
        break;
      }
    }
    await this.store.clearDirty(entry);
    return true;
  }

  // ---- tirage ----

  private async applyPull(res: PullResult, report: SyncReport): Promise<void> {
    for (const l of res.links) if (await this.store.putLinkSynced(l)) report.pulled.links++;
    for (const e of res.events) if (await this.store.addEventSynced(e)) report.pulled.events++;

    // Captures manquantes localement (hors ligne ensuite). Un échec ici ne bloque pas la synchro : réessayé à la suivante.
    for (const l of await this.store.listLinks()) {
      if (!l.screenshotId || (await this.store.hasScreenshot(l.screenshotId))) continue;
      try {
        const blob = await this.api.getScreenshot(l.screenshotId);
        if (blob) {
          await this.store.putScreenshotSynced(l.screenshotId, blob);
          report.pulled.screenshots++;
        }
      } catch (e) {
        if (e instanceof SyncAuthError) throw e;
      }
    }
  }
}

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
  /**
   * Envoi d'un lot de liens, atomique et idempotent. Retourne, dans le même ordre, la version qui fait foi côté serveur
   * (la nôtre, ou une plus récente). Un lot refusé (SyncHttpError) n'écrit rien : le moteur réessaie alors élément par élément.
   */
  pushLinks(links: Link[]): Promise<Link[]>;
  /** Idempotent : un événement déjà présent n'est jamais modifié. */
  pushEvents(events: LinkEvent[]): Promise<void>;
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

export const DEFAULT_BATCH_SIZE = 200;
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
    /** Nombre d'éléments par requête (le serveur accepte 500 au maximum). */
    private readonly batchSize = DEFAULT_BATCH_SIZE,
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

  /** Ordre : captures (une par une, binaire), puis liens par lots, puis événements par lots. */
  private async push(report: SyncReport): Promise<void> {
    const dirty = await this.store.listDirty();
    const of = (kind: DirtyEntry['kind']) => dirty.filter((d) => d.kind === kind);

    for (const entry of of('screenshot')) {
      try {
        const blob = await this.store.getScreenshot(entry.id);
        if (blob) await this.api.putScreenshot(entry.id, blob);
        await this.store.clearDirty(entry);
        report.pushed.screenshots++;
      } catch (e) {
        this.reject(e, `screenshot ${entry.id}`, report);
      }
    }
    for (const chunk of chunks(of('link'), this.batchSize)) await this.pushLinkChunk(chunk, report);
    for (const chunk of chunks(of('event'), this.batchSize)) await this.pushEventChunk(chunk, report);
  }

  /** Refus du serveur pour CET élément : signalé, il reste à pousser. Tout autre erreur (réseau, jeton) interrompt la synchro. */
  private reject(e: unknown, what: string, report: SyncReport): void {
    if (e instanceof SyncHttpError) report.rejected.push(`${what} : ${e.status} ${e.message}`);
    else throw e;
  }

  private async pushLinkChunk(chunk: DirtyEntry[], report: SyncReport): Promise<void> {
    const items: { entry: DirtyEntry; link: Link }[] = [];
    for (const entry of chunk) {
      const link = await this.store.getLink(entry.id);
      if (link) items.push({ entry, link });
      else await this.store.clearDirty(entry); // supprimé entre-temps : rien à pousser
    }
    if (!items.length) return;
    try {
      const authoritative = await this.api.pushLinks(items.map((i) => i.link));
      if (authoritative.length !== items.length) throw new SyncHttpError(502, 'réponse du serveur incohérente');
      for (const [i, { entry, link }] of items.entries()) {
        // Le serveur a gardé une autre version que la nôtre (plus récente, ou à égalité de date : il garde la première arrivée).
        // On s'aligne sur lui, sauf si le lien a encore été modifié localement pendant l'envoi (il restera marqué).
        if (canonical(authoritative[i]) !== canonical(link)) await this.store.adoptServerLink(link, authoritative[i]);
        await this.store.clearDirty(entry);
        report.pushed.links++;
      }
    } catch (e) {
      if (e instanceof SyncHttpError && items.length > 1) {
        // Un lot refusé n'a rien écrit : on réessaie un par un pour isoler le(s) fautif(s) sans bloquer les autres.
        for (const { entry } of items) await this.pushLinkChunk([entry], report);
      } else {
        this.reject(e, `link ${items[0].link.id}`, report);
      }
    }
  }

  private async pushEventChunk(chunk: DirtyEntry[], report: SyncReport): Promise<void> {
    const items: { entry: DirtyEntry; event: LinkEvent }[] = [];
    for (const entry of chunk) {
      const event = await this.store.getEvent(entry.id);
      if (event) items.push({ entry, event });
      else await this.store.clearDirty(entry);
    }
    if (!items.length) return;
    try {
      await this.api.pushEvents(items.map((i) => i.event));
      for (const { entry } of items) {
        await this.store.clearDirty(entry);
        report.pushed.events++;
      }
    } catch (e) {
      if (e instanceof SyncHttpError && items.length > 1) {
        for (const { entry } of items) await this.pushEventChunk([entry], report);
      } else {
        this.reject(e, `event ${items[0].event.id}`, report);
      }
    }
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

function* chunks<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

/** Comparaison de liens indépendante de l'ordre des clés (le serveur ne les renvoie pas dans l'ordre où on les a écrites). */
function canonical(l: Link): string {
  const o = l as unknown as Record<string, unknown>;
  return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
}

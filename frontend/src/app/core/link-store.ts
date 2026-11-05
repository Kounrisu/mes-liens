import { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames, openDB } from 'idb';
import { Link, LinkEvent } from './models';

/** Liens écrits avant l'existence des catégories / du focus : les champs manquent dans IndexedDB. */
function withDefaults(l: Link): Link {
  return l.category === undefined || l.source === undefined || l.focusRank === undefined
    ? { ...l, category: l.category ?? '', source: l.source ?? '', focusRank: l.focusRank ?? null }
    : l;
}

export type DirtyKind = 'link' | 'event' | 'screenshot';

/** Élément modifié localement et pas encore confirmé par le serveur. `n` change à chaque nouvelle modification. */
export interface DirtyEntry {
  key: string; // "link:<id>"
  kind: DirtyKind;
  id: string;
  n: number;
}

interface MesLiensDB extends DBSchema {
  links: {
    key: string;
    value: Link;
    indexes: { 'by-updatedAt': string; 'by-createdAt': string };
  };
  events: {
    key: string;
    value: LinkEvent;
    indexes: { 'by-linkId': string; 'by-at': string };
  };
  screenshots: {
    key: string;
    value: { id: string; blob: Blob };
  };
  /** À pousser vers le serveur. */
  dirty: {
    key: string;
    value: DirtyEntry;
  };
  /** Petites valeurs : curseur de synchro, configuration serveur. */
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

type Db = IDBPDatabase<MesLiensDB>;
type AnyTx = IDBPTransaction<MesLiensDB, StoreNames<MesLiensDB>[], 'readwrite'>;

/**
 * Couche stockage IndexedDB. Sans dépendance Angular : testable seule.
 * Toute écriture « locale » (putLink, addEvent, putScreenshot, softDeleteLink, import) marque l'élément à pousser, dans la
 * MÊME transaction que l'écriture : impossible d'avoir un changement sans marque (donc de perdre une modification en synchro).
 * Les méthodes `*Synced` écrivent ce qui vient du serveur, sans marquer.
 */
export class LinkStore {
  private constructor(private readonly db: Db) {}

  static async open(name = 'mes-liens'): Promise<LinkStore> {
    const db = await openDB<MesLiensDB>(name, 3, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const links = db.createObjectStore('links', { keyPath: 'id' });
          links.createIndex('by-updatedAt', 'updatedAt');
          links.createIndex('by-createdAt', 'createdAt');
          const events = db.createObjectStore('events', { keyPath: 'id' });
          events.createIndex('by-linkId', 'linkId');
          events.createIndex('by-at', 'at');
        }
        if (oldVersion < 2) {
          db.createObjectStore('screenshots', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          const dirty = db.createObjectStore('dirty', { keyPath: 'key' });
          db.createObjectStore('meta', { keyPath: 'key' });
          // Données écrites avant l'existence de la synchro (v1/v2) : jamais envoyées au serveur → tout est à pousser.
          if (oldVersion >= 1) {
            const kinds = [['links', 'link'], ['events', 'event'], ['screenshots', 'screenshot']] as const;
            for (const [storeName, kind] of kinds) {
              for (const id of await tx.objectStore(storeName).getAllKeys()) await dirty.put({ key: `${kind}:${id}`, kind, id: String(id), n: 1 });
            }
          }
        }
      },
    });
    return new LinkStore(db);
  }

  close(): void {
    this.db.close();
  }

  // ---- marquage « à pousser » ----

  private async mark(tx: AnyTx, kind: DirtyKind, id: string): Promise<void> {
    const key = `${kind}:${id}`;
    const store = tx.objectStore('dirty');
    const cur = await store.get(key);
    await store.put({ key, kind, id, n: (cur?.n ?? 0) + 1 });
  }

  async listDirty(): Promise<DirtyEntry[]> {
    return this.db.getAll('dirty');
  }

  /** N'efface la marque que si l'élément n'a pas été modifié depuis (n identique) : une modification faite pendant la synchro reste à pousser. */
  async clearDirty(entry: DirtyEntry): Promise<void> {
    const tx = this.db.transaction('dirty', 'readwrite');
    const cur = await tx.store.get(entry.key);
    if (cur && cur.n === entry.n) await tx.store.delete(entry.key);
    await tx.done;
  }

  /** Tout repousser (serveur réinitialisé). */
  async markAllDirty(): Promise<void> {
    const tx = this.db.transaction(['links', 'events', 'screenshots', 'dirty'], 'readwrite');
    for (const id of await tx.objectStore('links').getAllKeys()) await this.mark(tx, 'link', id);
    for (const id of await tx.objectStore('events').getAllKeys()) await this.mark(tx, 'event', id);
    for (const id of await tx.objectStore('screenshots').getAllKeys()) await this.mark(tx, 'screenshot', id);
    await tx.done;
  }

  // ---- meta ----

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get('meta', key))?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put('meta', { key, value });
  }

  async deleteMeta(key: string): Promise<void> {
    await this.db.delete('meta', key);
  }

  // ---- captures ----

  /** Capture locale (à pousser). */
  async putScreenshot(id: string, blob: Blob): Promise<void> {
    const tx = this.db.transaction(['screenshots', 'dirty'], 'readwrite');
    await tx.objectStore('screenshots').put({ id, blob });
    await this.mark(tx, 'screenshot', id);
    await tx.done;
  }

  /** Capture reçue du serveur. */
  async putScreenshotSynced(id: string, blob: Blob): Promise<void> {
    await this.db.put('screenshots', { id, blob });
  }

  async getScreenshot(id: string): Promise<Blob | undefined> {
    return (await this.db.get('screenshots', id))?.blob;
  }

  async hasScreenshot(id: string): Promise<boolean> {
    return (await this.db.getKey('screenshots', id)) !== undefined;
  }

  // ---- liens ----

  /** Crée ou remplace l'enregistrement entier (modification locale : à pousser). */
  async putLink(link: Link): Promise<void> {
    const tx = this.db.transaction(['links', 'dirty'], 'readwrite');
    await tx.objectStore('links').put(link);
    await this.mark(tx, 'link', link.id);
    await tx.done;
  }

  /**
   * Version reçue du serveur. Le plus récent gagne : n'écrase pas un état local plus récent (modification locale pas encore poussée).
   * Retourne true si le lien local a été écrit.
   */
  async putLinkSynced(link: Link): Promise<boolean> {
    const tx = this.db.transaction('links', 'readwrite');
    const local = await tx.store.get(link.id);
    const write = !local || Date.parse(link.updatedAt) > Date.parse(local.updatedAt);
    if (write) await tx.store.put(link);
    await tx.done;
    return write;
  }

  /** Remplace `pushed` par la version du serveur, seulement si le lien local n'a pas bougé depuis l'envoi (même updatedAt). */
  async adoptServerLink(pushed: Link, authoritative: Link): Promise<void> {
    const tx = this.db.transaction('links', 'readwrite');
    const local = await tx.store.get(pushed.id);
    if (local && local.updatedAt === pushed.updatedAt) await tx.store.put(authoritative);
    await tx.done;
  }

  async getLink(id: string): Promise<Link | undefined> {
    const l = await this.db.get('links', id);
    return l && withDefaults(l);
  }

  /** Liste triée du plus récent au plus ancien (createdAt). Les tombstones sont exclus par défaut. */
  async listLinks(opts: { includeDeleted?: boolean } = {}): Promise<Link[]> {
    const all = (await this.db.getAllFromIndex('links', 'by-createdAt')).map(withDefaults);
    const out = opts.includeDeleted ? all : all.filter((l) => l.deletedAt === null);
    return out.reverse();
  }

  /** Suppression logique : pose le tombstone, avance updatedAt, marque à pousser. */
  async softDeleteLink(id: string, now: string): Promise<boolean> {
    const tx = this.db.transaction(['links', 'dirty'], 'readwrite');
    const link = await tx.objectStore('links').get(id);
    if (!link || link.deletedAt !== null) {
      await tx.done;
      return false;
    }
    await tx.objectStore('links').put({ ...link, deletedAt: now, updatedAt: now });
    await this.mark(tx, 'link', id);
    await tx.done;
    return true;
  }

  // ---- événements ----

  /** Ajout seul : refuse d'écraser un événement existant. Local : à pousser. */
  async addEvent(event: LinkEvent): Promise<void> {
    const tx = this.db.transaction(['events', 'dirty'], 'readwrite');
    try {
      await tx.objectStore('events').add(event); // id déjà présent → ConstraintError : la transaction est annulée
      await this.mark(tx, 'event', event.id);
    } catch (e) {
      tx.done.catch(() => undefined); // l'annulation de la transaction ne doit pas ressortir en « unhandled rejection »
      throw e;
    }
    await tx.done;
  }

  /** Événement reçu du serveur : ajouté s'il est absent, jamais modifié. */
  async addEventSynced(event: LinkEvent): Promise<boolean> {
    const tx = this.db.transaction('events', 'readwrite');
    const exists = (await tx.store.getKey(event.id)) !== undefined;
    if (!exists) await tx.store.add(event);
    await tx.done;
    return !exists;
  }

  async getEvent(id: string): Promise<LinkEvent | undefined> {
    return this.db.get('events', id);
  }

  async listEvents(linkId?: string): Promise<LinkEvent[]> {
    const events = linkId
      ? await this.db.getAllFromIndex('events', 'by-linkId', linkId)
      : await this.db.getAllFromIndex('events', 'by-at');
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  // ---- restauration / import ----

  /** Remplacement complet, atomique (restauration d'une sauvegarde). Tout est à pousser ensuite. Seul chemin de suppression d'événements. */
  async replaceAll(links: Link[], events: LinkEvent[]): Promise<void> {
    const tx = this.db.transaction(['links', 'events', 'dirty'], 'readwrite');
    await Promise.all([tx.objectStore('links').clear(), tx.objectStore('events').clear(), tx.objectStore('dirty').clear()]);
    for (const l of links) {
      await tx.objectStore('links').put(l);
      await this.mark(tx, 'link', l.id);
    }
    for (const e of events) {
      await tx.objectStore('events').put(e);
      await this.mark(tx, 'event', e.id);
    }
    await tx.done;
  }

  /** Fusion : le plus récent gagne par lien (updatedAt) ; événements ajoutés s'ils sont absents. Ce qui est écrit est à pousser. */
  async mergeAll(links: Link[], events: LinkEvent[]): Promise<{ linksWritten: number; eventsAdded: number }> {
    const tx = this.db.transaction(['links', 'events', 'dirty'], 'readwrite');
    let linksWritten = 0;
    let eventsAdded = 0;
    for (const incoming of links) {
      const local = await tx.objectStore('links').get(incoming.id);
      if (!local || Date.parse(incoming.updatedAt) > Date.parse(local.updatedAt)) {
        await tx.objectStore('links').put(incoming);
        await this.mark(tx, 'link', incoming.id);
        linksWritten++;
      }
    }
    for (const e of events) {
      if (!(await tx.objectStore('events').get(e.id))) {
        await tx.objectStore('events').put(e);
        await this.mark(tx, 'event', e.id);
        eventsAdded++;
      }
    }
    await tx.done;
    return { linksWritten, eventsAdded };
  }

  async clear(): Promise<void> {
    await this.replaceAll([], []);
  }
}

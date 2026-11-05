import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Link, LinkEvent } from './models';

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
}

/** Couche stockage IndexedDB. Sans dépendance Angular : testable seule. */
export class LinkStore {
  private constructor(private readonly db: IDBPDatabase<MesLiensDB>) {}

  static async open(name = 'mes-liens'): Promise<LinkStore> {
    const db = await openDB<MesLiensDB>(name, 1, {
      upgrade(db) {
        const links = db.createObjectStore('links', { keyPath: 'id' });
        links.createIndex('by-updatedAt', 'updatedAt');
        links.createIndex('by-createdAt', 'createdAt');
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('by-linkId', 'linkId');
        events.createIndex('by-at', 'at');
      },
    });
    return new LinkStore(db);
  }

  close(): void {
    this.db.close();
  }

  /** Crée ou remplace l'enregistrement entier. */
  async putLink(link: Link): Promise<void> {
    await this.db.put('links', link);
  }

  async getLink(id: string): Promise<Link | undefined> {
    return this.db.get('links', id);
  }

  /** Liste triée du plus récent au plus ancien (createdAt). Les tombstones sont exclus par défaut. */
  async listLinks(opts: { includeDeleted?: boolean } = {}): Promise<Link[]> {
    const all = await this.db.getAllFromIndex('links', 'by-createdAt');
    const out = opts.includeDeleted ? all : all.filter((l) => l.deletedAt === null);
    return out.reverse();
  }

  /** Suppression logique : pose le tombstone et avance updatedAt. */
  async softDeleteLink(id: string, now: string): Promise<boolean> {
    const tx = this.db.transaction('links', 'readwrite');
    const link = await tx.store.get(id);
    if (!link || link.deletedAt !== null) {
      await tx.done;
      return false;
    }
    await tx.store.put({ ...link, deletedAt: now, updatedAt: now });
    await tx.done;
    return true;
  }

  /** Ajout seul : refuse d'écraser un événement existant. */
  async addEvent(event: LinkEvent): Promise<void> {
    await this.db.add('events', event);
  }

  async listEvents(linkId?: string): Promise<LinkEvent[]> {
    const events = linkId
      ? await this.db.getAllFromIndex('events', 'by-linkId', linkId)
      : await this.db.getAllFromIndex('events', 'by-at');
    return events.sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Remplacement complet, atomique (restauration d'une sauvegarde). Seul chemin de suppression d'événements. */
  async replaceAll(links: Link[], events: LinkEvent[]): Promise<void> {
    const tx = this.db.transaction(['links', 'events'], 'readwrite');
    await Promise.all([tx.objectStore('links').clear(), tx.objectStore('events').clear()]);
    for (const l of links) tx.objectStore('links').put(l);
    for (const e of events) tx.objectStore('events').put(e);
    await tx.done;
  }

  /** Fusion : le plus récent gagne par lien (updatedAt) ; événements ajoutés s'ils sont absents. */
  async mergeAll(links: Link[], events: LinkEvent[]): Promise<{ linksWritten: number; eventsAdded: number }> {
    const tx = this.db.transaction(['links', 'events'], 'readwrite');
    let linksWritten = 0;
    let eventsAdded = 0;
    for (const incoming of links) {
      const local = await tx.objectStore('links').get(incoming.id);
      if (!local || incoming.updatedAt > local.updatedAt) {
        await tx.objectStore('links').put(incoming);
        linksWritten++;
      }
    }
    for (const e of events) {
      if (!(await tx.objectStore('events').get(e.id))) {
        await tx.objectStore('events').put(e);
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

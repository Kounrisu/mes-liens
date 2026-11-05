import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LinkStore } from './link-store';
import { Link, LinkEvent } from './models';
import { PullResult, SyncApi, SyncAuthError, SyncEngine, SyncHttpError, SyncNetworkError } from './sync';

/** Serveur en mémoire qui reproduit les règles du vrai : le plus récent gagne, égalité = le serveur garde, curseur = numéro d'écriture. */
class FakeServer implements SyncApi {
  links = new Map<string, { link: Link; seq: number }>();
  events = new Map<string, { ev: LinkEvent; seq: number }>();
  shots = new Map<string, Blob>();
  seq = 0;
  online = true;
  calls: string[] = [];
  failAt: number | null = null; // la Nième requête échoue (réseau)
  rejectLinkId: string | null = null;
  authFails = false;
  onPutLink: ((l: Link) => Promise<void>) | null = null;
  private n = 0;

  private gate(label: string): void {
    this.calls.push(label);
    if (this.authFails) throw new SyncAuthError('jeton');
    if (!this.online) throw new SyncNetworkError('hors ligne');
    if (this.failAt !== null && ++this.n === this.failAt) throw new SyncNetworkError('coupure');
  }

  async putLink(l: Link): Promise<Link> {
    this.gate(`putLink:${l.title}`);
    if (this.onPutLink) await this.onPutLink(l);
    if (this.rejectLinkId === l.id) throw new SyncHttpError(400, 'refusé');
    const cur = this.links.get(l.id);
    if (!cur || Date.parse(l.updatedAt) > Date.parse(cur.link.updatedAt)) {
      this.links.set(l.id, { link: structuredClone(l), seq: ++this.seq });
      return structuredClone(l);
    }
    return structuredClone(cur.link);
  }
  async postEvent(e: LinkEvent): Promise<void> {
    this.gate(`postEvent:${e.id}`);
    if (!this.events.has(e.id)) this.events.set(e.id, { ev: structuredClone(e), seq: ++this.seq });
  }
  async putScreenshot(id: string, b: Blob): Promise<void> {
    this.gate(`putScreenshot:${id}`);
    if (!this.shots.has(id)) this.shots.set(id, b);
  }
  async getScreenshot(id: string): Promise<Blob | null> {
    this.gate(`getScreenshot:${id}`);
    return this.shots.get(id) ?? null;
  }
  async pull(since: number): Promise<PullResult> {
    this.gate('pull');
    const l = [...this.links.values()].filter((x) => x.seq > since);
    const e = [...this.events.values()].filter((x) => x.seq > since);
    const cursor = Math.max(since, ...l.map((x) => x.seq), ...e.map((x) => x.seq));
    return { cursor, head: this.seq, links: l.map((x) => structuredClone(x.link)), events: e.map((x) => structuredClone(x.ev)) };
  }
  reset(): void {
    this.links.clear();
    this.events.clear();
    this.shots.clear();
    this.seq = 0;
  }
}

const T = (n: number) => new Date(Date.UTC(2026, 10, 5, 10, n)).toISOString(); // T(0)=10:00 … ms
const mk = (id: string, title: string, at: number, over: Partial<Link> = {}): Link => ({
  id, url: 'https://example.com/' + id, title, domain: 'example.com', tags: [], note: '', screenshotId: null, category: '', source: '', focusRank: null, kind: 'link', parentId: null,
  createdAt: T(0), updatedAt: T(at), deletedAt: null, ...over,
});
const ev = (id: string, linkId: string, at: string): LinkEvent => ({ id, linkId, type: 'created', payload: {}, at });

let server: FakeServer;
let n = 0;
const devices: { store: LinkStore; engine: SyncEngine }[] = [];
async function device() {
  const store = await LinkStore.open(`sync-${n++}`);
  const d = { store, engine: new SyncEngine(store, server, () => T(59)) };
  devices.push(d);
  return d;
}
beforeEach(() => {
  server = new FakeServer();
});
afterEach(() => {
  for (const d of devices.splice(0)) d.store.close();
});

const titles = async (s: LinkStore) => (await s.listLinks()).map((l) => l.title).sort();

describe('critère phase 4 : lien créé hors ligne', () => {
  it('apparaît sur l’autre appareil après reconnexion, sans rien perdre ni dupliquer', async () => {
    const phone = await device();
    const laptop = await device();
    server.online = false;
    await phone.store.putLink(mk('a', 'créé hors ligne', 5));
    await phone.store.addEvent(ev('e1', 'a', T(5)));
    await expect(phone.engine.sync()).rejects.toBeInstanceOf(SyncNetworkError);
    expect((await phone.store.listDirty()).length).toBe(2); // rien n'est perdu
    await expect(laptop.engine.sync()).rejects.toBeInstanceOf(SyncNetworkError);

    server.online = true;
    await phone.engine.sync();
    await laptop.engine.sync();
    expect(await titles(laptop.store)).toEqual(['créé hors ligne']);
    expect(await laptop.store.listEvents()).toHaveLength(1);
    expect(await phone.store.listDirty()).toEqual([]);

    await phone.engine.sync();
    await laptop.engine.sync(); // resynchroniser ne change rien
    expect(server.links.size).toBe(1);
    expect(server.events.size).toBe(1);
  });

  it('un lien poussé tard avec une vieille date est vu par un appareil déjà synchronisé (curseur serveur, pas updatedAt)', async () => {
    const phone = await device();
    const laptop = await device();
    await laptop.store.putLink(mk('x', 'récent', 50));
    await laptop.engine.sync(); // le portable a un curseur élevé
    await phone.store.putLink(mk('old', 'vieille date', 10)); // écrit « hier », poussé maintenant
    await phone.engine.sync();
    await laptop.engine.sync();
    expect(await titles(laptop.store)).toEqual(['récent', 'vieille date']);
  });
});

describe('conflits : le plus récent gagne sur l’enregistrement entier', () => {
  it('deux modifications hors ligne : la plus récente gagne partout, dans les deux ordres de synchro', async () => {
    for (const order of ['AB', 'BA']) {
      server.reset();
      const a = await device();
      const b = await device();
      await a.store.putLink(mk('l', 'base', 1));
      await a.engine.sync();
      await b.engine.sync();
      await a.store.putLink(mk('l', 'A à 10:20', 20, { note: 'note A' }));
      await b.store.putLink(mk('l', 'B à 10:30', 30, { note: 'note B' }));
      for (const who of order) await (who === 'A' ? a : b).engine.sync();
      await a.engine.sync();
      await b.engine.sync();
      for (const d of [a, b]) {
        const l = await d.store.getLink('l');
        expect([l?.title, l?.note], order).toEqual(['B à 10:30', 'note B']); // pas de mélange champ par champ
      }
    }
  });

  it('égalité exacte de date : les deux appareils convergent vers la version du serveur', async () => {
    const a = await device();
    const b = await device();
    await a.store.putLink(mk('l', 'version A', 20));
    await b.store.putLink(mk('l', 'version B', 20));
    await a.engine.sync();
    await b.engine.sync(); // B est refusé (égalité) et doit s'aligner
    await a.engine.sync();
    expect((await a.store.getLink('l'))?.title).toBe('version A');
    expect((await b.store.getLink('l'))?.title).toBe('version A');
  });

  it('la modification locale plus récente que le serveur n’est pas écrasée par la lecture', async () => {
    const a = await device();
    const b = await device();
    await a.store.putLink(mk('l', 'v1', 1));
    await a.engine.sync();
    await b.engine.sync();
    await a.store.putLink(mk('l', 'v2 serveur', 10));
    await a.engine.sync();
    server.online = false;
    await b.store.putLink(mk('l', 'v3 locale', 20));
    server.online = true;
    await b.engine.sync();
    await a.engine.sync();
    expect((await a.store.getLink('l'))?.title).toBe('v3 locale');
  });
});

describe('suppressions (tombstones)', () => {
  it('une suppression se propage et le lien disparaît de la liste partout', async () => {
    const a = await device();
    const b = await device();
    await a.store.putLink(mk('l', 'à supprimer', 1));
    await a.engine.sync();
    await b.engine.sync();
    await b.store.softDeleteLink('l', T(10));
    await b.engine.sync();
    await a.engine.sync();
    expect(await a.store.listLinks()).toEqual([]);
    expect((await a.store.getLink('l'))?.deletedAt).toBe(T(10)); // le tombstone est conservé
  });

  it('suppression plus récente qu’une édition hors ligne : la suppression gagne', async () => {
    const a = await device();
    const b = await device();
    await a.store.putLink(mk('l', 'x', 1));
    await a.engine.sync();
    await b.engine.sync();
    await a.store.softDeleteLink('l', T(30));
    await b.store.putLink(mk('l', 'édité hors ligne', 20));
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    expect(await a.store.listLinks()).toEqual([]);
    expect(await b.store.listLinks()).toEqual([]);
  });

  it('édition plus récente que la suppression : le lien revient partout', async () => {
    const a = await device();
    const b = await device();
    await a.store.putLink(mk('l', 'x', 1));
    await a.engine.sync();
    await b.engine.sync();
    await a.store.softDeleteLink('l', T(20));
    await b.store.putLink(mk('l', 'édité après', 30));
    await a.engine.sync();
    await b.engine.sync();
    await a.engine.sync();
    expect(await titles(a.store)).toEqual(['édité après']);
    expect(await titles(b.store)).toEqual(['édité après']);
  });

  it('un appareil neuf reçoit les tombstones sans faire réapparaître le lien', async () => {
    const a = await device();
    await a.store.putLink(mk('l', 'x', 1));
    await a.store.softDeleteLink('l', T(5));
    await a.engine.sync();
    const fresh = await device();
    await fresh.engine.sync();
    expect(await fresh.store.listLinks()).toEqual([]);
  });
});

describe('robustesse', () => {
  it('coupure au milieu de la poussée : le reste est poussé ensuite, sans doublon', async () => {
    const a = await device();
    for (let i = 0; i < 4; i++) await a.store.putLink(mk('l' + i, 't' + i, i + 1));
    await a.store.addEvent(ev('e1', 'l0', T(1)));
    server.failAt = 3; // la 3e requête échoue
    await expect(a.engine.sync()).rejects.toBeInstanceOf(SyncNetworkError);
    expect((await a.store.listDirty()).length).toBeGreaterThan(0);
    server.failAt = null;
    await a.engine.sync();
    await a.engine.sync();
    expect(server.links.size).toBe(4);
    expect(server.events.size).toBe(1);
    expect(await a.store.listDirty()).toEqual([]);
  });

  it('modification faite PENDANT l’envoi : elle reste à pousser et n’est pas écrasée', async () => {
    const a = await device();
    await a.store.putLink(mk('l', 'v1', 1));
    let fired = false;
    server.onPutLink = async () => {
      if (fired) return;
      fired = true;
      await a.store.putLink(mk('l', 'v2 pendant la synchro', 9));
    };
    await a.engine.sync();
    expect((await a.store.getLink('l'))?.title).toBe('v2 pendant la synchro');
    expect((await a.store.listDirty()).map((d) => d.key)).toEqual(['link:l']);
    server.onPutLink = null;
    await a.engine.sync();
    expect(server.links.get('l')?.link.title).toBe('v2 pendant la synchro');
    expect(await a.store.listDirty()).toEqual([]);
  });

  it('un élément refusé par le serveur est signalé, reste à pousser, et ne bloque pas les autres', async () => {
    const a = await device();
    await a.store.putLink(mk('bad', 'mauvais', 1));
    await a.store.putLink(mk('ok', 'bon', 2));
    server.rejectLinkId = 'bad';
    const r = await a.engine.sync();
    expect(r.rejected).toHaveLength(1);
    expect(server.links.has('ok')).toBe(true);
    expect((await a.store.listDirty()).map((d) => d.id)).toEqual(['bad']);
  });

  it('jeton refusé : erreur d’authentification, rien n’est marqué comme envoyé', async () => {
    const a = await device();
    await a.store.putLink(mk('l', 'x', 1));
    server.authFails = true;
    await expect(a.engine.sync()).rejects.toBeInstanceOf(SyncAuthError);
    expect(await a.store.listDirty()).toHaveLength(1);
  });

  it('serveur réinitialisé : l’appareil repart de zéro et repousse tout', async () => {
    const a = await device();
    const b = await device();
    await a.store.putLink(mk('l', 'x', 1));
    await a.engine.sync();
    await b.engine.sync();
    server.reset();
    const r = await a.engine.sync();
    expect(r.serverReset).toBe(true);
    expect(server.links.has('l')).toBe(true);
    await b.engine.sync();
    expect(await titles(b.store)).toEqual(['x']);
  });

  it('deux sync() simultanés partagent un seul passage', async () => {
    const a = await device();
    await a.store.putLink(mk('l', 'x', 1));
    const [r1, r2] = await Promise.all([a.engine.sync(), a.engine.sync()]);
    expect(r1).toBe(r2);
    expect(server.calls.filter((c) => c.startsWith('putLink'))).toHaveLength(1);
  });
});

describe('événements et captures', () => {
  it('un événement ancien (at) créé hors ligne arrive quand même, une seule fois', async () => {
    const a = await device();
    const b = await device();
    await b.store.putLink(mk('z', 'z', 90));
    await b.engine.sync();
    await a.store.addEvent(ev('old', 'z', '2001-01-01T00:00:00.000Z'));
    await a.engine.sync();
    await b.engine.sync();
    await b.engine.sync();
    expect((await b.store.listEvents()).map((e) => e.id)).toEqual(['old']);
  });

  it('les événements restent en ajout seul : un événement local n’est jamais modifié par la synchro', async () => {
    const a = await device();
    await a.store.addEvent(ev('e', 'l', T(1)));
    await a.engine.sync();
    server.events.get('e')!.ev.payload = { falsifie: true }; // le serveur diverge : on ne réécrit pas l'existant
    await a.engine.sync();
    expect((await a.store.getEvent('e'))?.payload).toEqual({});
  });

  it('la capture est envoyée AVANT le lien qui la référence, puis téléchargée par l’autre appareil', async () => {
    const a = await device();
    const b = await device();
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await a.store.putLink(mk('l', 'avec capture', 1, { screenshotId: 's1' }));
    await a.store.putScreenshot('s1', png);
    await a.engine.sync();
    const order = server.calls.filter((c) => c.startsWith('put'));
    expect(order.findIndex((c) => c.startsWith('putScreenshot'))).toBeLessThan(order.findIndex((c) => c.startsWith('putLink')));

    await b.engine.sync();
    expect(await b.store.hasScreenshot('s1')).toBe(true);
    expect(await b.store.getScreenshot('s1')).toBeDefined(); // (le contenu d'un Blob ne survit pas au clonage de fake-indexeddb sous jsdom : limite de l'environnement de test)
  });

  it('capture absente du serveur : la synchro réussit et réessaie plus tard', async () => {
    const b = await device();
    server.links.set('l', { link: mk('l', 'x', 1, { screenshotId: 'manquante' }), seq: ++server.seq });
    await b.engine.sync();
    expect(await b.store.hasScreenshot('manquante')).toBe(false);
    server.shots.set('manquante', new Blob(['x'], { type: 'image/png' }));
    await b.engine.sync();
    expect(await b.store.hasScreenshot('manquante')).toBe(true);
  });
});

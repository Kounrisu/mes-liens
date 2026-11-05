import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { importFromJson } from './backup';
import { LinkStore } from './link-store';
import { checkHierarchy } from './sites';

/**
 * Valide un fichier d'import AVANT de l'utiliser dans l'app : même validateur que le bouton « Importer »,
 * puis contrôles de cohérence (sites/rattachements, doublons, schémas d'URL). Ignoré par défaut.
 * Lancer : IMPORT_FILE=imports/mes-liens-import.json npx ng test --watch=false
 */
type Proc = { env?: Record<string, string | undefined>; getBuiltinModule?: (n: string) => { readFileSync: (p: string, e: string) => string } };
const proc = (globalThis as { process?: Proc }).process;
const FILE = proc?.env?.['IMPORT_FILE'];

describe.skipIf(!FILE)('fichier d’import', () => {
  it('est accepté par l’importeur de l’app et cohérent', async () => {
    const json = proc!.getBuiltinModule!('node:fs').readFileSync(FILE!, 'utf8');
    const parsed = JSON.parse(json) as { links: { url: string; id: string }[]; events: unknown[] };

    const store = await LinkStore.open('import-check');
    const t0 = Date.now();
    const r = await importFromJson(store, json, 'merge'); // lève ImportError si le fichier est invalide
    const ms = Date.now() - t0;
    expect(r.links).toBe(parsed.links.length);
    expect(r.events).toBe(parsed.events.length);

    const links = await store.listLinks({ includeDeleted: true });
    expect(links).toHaveLength(parsed.links.length);
    expect(new Set(links.map((l) => l.id)).size).toBe(links.length);
    expect(new Set(links.map((l) => l.url.replace(/#.*$/, '').replace(/\/$/, ''))).size).toBe(links.length); // aucune URL en double
    for (const l of links) {
      expect(l.url, l.url).toMatch(/^https?:\/\//); // jamais de javascript:, file:, data:…
      expect(checkHierarchy(links, l.id, l.kind, l.parentId), l.title).toBeNull(); // rattachements valides
      expect(l.title.length).toBeGreaterThan(0);
    }
    const sites = links.filter((l) => l.kind === 'site');
    console.log(`import OK : ${links.length} liens dont ${sites.length} sites, ${r.events} événements, ${ms} ms`);
    store.close();
  });
});

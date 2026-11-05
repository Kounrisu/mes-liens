import { describe, expect, it } from 'vitest';
import { focusOrder, planAdd, planMove, planRemove, renumber } from './focus';
import { Link } from './models';

const mk = (id: string, focusRank: number | null, over: Partial<Link> = {}): Link => ({
  id, url: 'https://example.com', title: id, domain: '', tags: [], note: '', screenshotId: null, category: '', source: '', focusRank,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: null, ...over,
});
const obj = (m: Map<string, number | null>) => Object.fromEntries(m);

describe('focusOrder', () => {
  it('ne garde que les liens du focus non supprimés, par rang', () => {
    const links = [mk('c', 3), mk('x', null), mk('a', 1), mk('gone', 2, { deletedAt: '2026-11-02T00:00:00.000Z' }), mk('b', 2)];
    expect(focusOrder(links).map((l) => l.id)).toEqual(['a', 'b', 'c']);
  });
  it('rangs en double (ajouts hors ligne sur deux appareils) : ordre total et stable, identique partout', () => {
    const a = mk('zzz', 4, { createdAt: '2026-11-01T10:00:00.000Z' });
    const b = mk('aaa', 4, { createdAt: '2026-11-01T11:00:00.000Z' });
    expect(focusOrder([a, b]).map((l) => l.id)).toEqual(['zzz', 'aaa']);
    expect(focusOrder([b, a]).map((l) => l.id)).toEqual(['zzz', 'aaa']);
    const same = [mk('b', 4), mk('a', 4)]; // même date aussi : départagé par id
    expect(focusOrder(same).map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('renumber', () => {
  it('rend 1..n sans trou ni doublon, en ne touchant que ce qui change', () => {
    expect(obj(renumber([mk('a', 1), mk('b', 5), mk('c', 5)]))).toEqual({ b: 2, c: 3 });
    expect(renumber([mk('a', 1), mk('b', 2)]).size).toBe(0);
  });
});

describe('planAdd', () => {
  it('ajoute en dernière position', () => {
    const all = [mk('a', 1), mk('b', 2), mk('new', null)];
    expect(obj(planAdd(all, 'new'))).toEqual({ new: 3 });
  });
  it('déjà dans le focus, supprimé ou inconnu : rien', () => {
    const all = [mk('a', 1), mk('gone', null, { deletedAt: '2026-11-02T00:00:00.000Z' })];
    expect(planAdd(all, 'a').size).toBe(0);
    expect(planAdd(all, 'gone').size).toBe(0);
    expect(planAdd(all, 'inconnu').size).toBe(0);
  });
  it('referme au passage des trous existants', () => {
    expect(obj(planAdd([mk('a', 1), mk('b', 7), mk('n', null)], 'n'))).toEqual({ b: 2, n: 3 });
  });
});

describe('planRemove', () => {
  it('retire (rang null) et referme le trou', () => {
    const all = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 4)];
    expect(obj(planRemove(all, 'b'))).toEqual({ b: null, c: 2, d: 3 });
  });
  it('retirer le dernier ne renumérote personne ; un lien hors focus : rien', () => {
    expect(obj(planRemove([mk('a', 1), mk('b', 2)], 'b'))).toEqual({ b: null });
    expect(planRemove([mk('a', 1), mk('x', null)], 'x').size).toBe(0);
  });
});

describe('planMove', () => {
  const all = [mk('a', 1), mk('b', 2), mk('c', 3)];
  it('échange avec le voisin', () => {
    expect(obj(planMove(all, 'b', -1))).toEqual({ a: 2, b: 1 });
    expect(obj(planMove(all, 'b', 1))).toEqual({ b: 3, c: 2 });
  });
  it('sans effet aux extrémités ou hors focus', () => {
    expect(planMove(all, 'a', -1).size).toBe(0);
    expect(planMove(all, 'c', 1).size).toBe(0);
    expect(planMove([...all, mk('x', null)], 'x', -1).size).toBe(0);
  });
  it('avec des rangs en double, le déplacement donne quand même une numérotation propre', () => {
    const dup = [mk('a', 2, { createdAt: '2026-11-01T01:00:00.000Z' }), mk('b', 2, { createdAt: '2026-11-01T02:00:00.000Z' })];
    expect(obj(planMove(dup, 'b', -1))).toEqual({ b: 1 }); // a garde 2 : déjà correct
  });
});

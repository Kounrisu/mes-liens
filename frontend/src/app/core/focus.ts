import { Link } from './models';

/**
 * Ordre d'affichage du focus. Le rang stocké peut être en double (deux appareils ont ajouté un favori hors ligne : tous deux « n+1 »)
 * ou avoir des trous : on trie par rang, puis par date de création, puis par id (ordre total, donc identique sur tous les appareils).
 * La position affichée est l'index + 1, jamais la valeur brute.
 */
export function focusOrder(links: readonly Link[]): Link[] {
  return links
    .filter((l) => l.focusRank !== null && l.deletedAt === null)
    .sort((a, b) => a.focusRank! - b.focusRank! || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** Rangs à écrire pour que `ordered` soit numéroté 1..n sans trou ni doublon. Seuls les liens dont le rang change sont retournés. */
export function renumber(ordered: readonly Link[]): Map<string, number | null> {
  const changes = new Map<string, number | null>();
  ordered.forEach((l, i) => {
    if (l.focusRank !== i + 1) changes.set(l.id, i + 1);
  });
  return changes;
}

/** Ajoute un lien en dernière position. */
export function planAdd(all: readonly Link[], id: string): Map<string, number | null> {
  const order = focusOrder(all);
  if (order.some((l) => l.id === id)) return new Map();
  const target = all.find((l) => l.id === id && l.deletedAt === null);
  return target ? renumber([...order, target]) : new Map();
}

/** Retire un lien du focus (rang null) et referme le trou. */
export function planRemove(all: readonly Link[], id: string): Map<string, number | null> {
  const order = focusOrder(all);
  if (!order.some((l) => l.id === id)) return new Map();
  const changes = renumber(order.filter((l) => l.id !== id));
  changes.set(id, null);
  return changes;
}

/** Monte (-1) ou descend (+1) d'une position. Sans effet aux extrémités. */
export function planMove(all: readonly Link[], id: string, delta: -1 | 1): Map<string, number | null> {
  const order = focusOrder(all);
  const i = order.findIndex((l) => l.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return new Map();
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return renumber(next);
}

import { Link, LinkKind } from './models';

/** Les sites (plateformes) enregistrés, par titre. */
export function sitesOf(links: readonly Link[]): Link[] {
  return links
    .filter((l) => l.kind === 'site' && l.deletedAt === null)
    .sort((a, b) => a.title.localeCompare(b.title, 'fr', { sensitivity: 'base' }));
}

/** Les liens rattachés à un site, du plus récent au plus ancien. Un lien rattaché à un site supprimé ou qui n'en est plus un n'y figure pas. */
export function childrenOf(links: readonly Link[], siteId: string): Link[] {
  const site = links.find((l) => l.id === siteId);
  if (!site || site.kind !== 'site' || site.deletedAt !== null) return [];
  return links.filter((l) => l.parentId === siteId && l.kind === 'link' && l.deletedAt === null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Le site d'un lien, ou undefined. Tolérant : en synchronisation le parent peut manquer, avoir été supprimé ailleurs ou changé de nature ;
 * le lien s'affiche alors simplement sans site (jamais d'erreur à l'affichage).
 */
export function siteOf(links: readonly Link[], link: Link): Link | undefined {
  if (!link.parentId) return undefined;
  const p = links.find((l) => l.id === link.parentId);
  return p && p.kind === 'site' && p.deletedAt === null ? p : undefined;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Propose le site correspondant à une adresse : même domaine, ou l'un est un sous-domaine de l'autre
 * (site « app.ultimatecourses.com » ↔ lien « app.ultimatecourses.com/courses/x » ; site « youtube.com » ↔ « www.youtube.com/watch »).
 * Le correspondant le plus précis (domaine le plus long) l'emporte. `notyoutube.com` ne correspond pas à `youtube.com`.
 */
export function findSiteForUrl(sites: readonly Link[], url: string | null): Link | undefined {
  const host = url ? hostOf(url) : null;
  if (!host) return undefined;
  let best: { site: Link; len: number } | undefined;
  for (const s of sites) {
    const sh = hostOf(s.url);
    if (!sh) continue;
    const base = (h: string) => h.replace(/^www\./, '');
    const a = base(host);
    const b = base(sh);
    if (a === b || a.endsWith('.' + b) || b.endsWith('.' + a)) {
      // Domaine identique = meilleur score ; sinon plus le domaine commun est long, plus c'est précis.
      const score = a === b ? Number.MAX_SAFE_INTEGER : Math.min(a.length, b.length);
      if (!best || score > best.len) best = { site: s, len: score };
    }
  }
  return best?.site;
}

/**
 * Règles de rattachement. Retourne un message d'erreur, ou null si valide.
 *  - un lien ne peut pas être son propre parent ;
 *  - un site n'a pas de parent (un seul niveau) ;
 *  - le parent doit être un site existant, non supprimé ;
 *  - un site qui a des liens rattachés ne peut pas redevenir un lien ordinaire.
 */
export function checkHierarchy(links: readonly Link[], id: string | null, kind: LinkKind, parentId: string | null): string | null {
  if (kind === 'site' && parentId) return 'Un site ne peut pas être rattaché à un autre site.';
  if (parentId) {
    if (parentId === id) return 'Un lien ne peut pas être rattaché à lui-même.';
    const p = links.find((l) => l.id === parentId);
    if (!p || p.deletedAt !== null || p.kind !== 'site') return "Le site choisi n'existe plus (il a peut-être été supprimé).";
  }
  if (id && kind === 'link' && childrenOf(links, id).length > 0) {
    return 'Ce site a des liens rattachés : détache-les ou supprime-les avant d’en faire un lien ordinaire.';
  }
  return null;
}

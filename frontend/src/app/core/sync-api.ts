import { Link, LinkEvent } from './models';
import { PullResult, SyncApi, SyncAuthError, SyncHttpError, SyncNetworkError } from './sync';

/**
 * Le jeton donne accès à TOUTES les données : jamais en clair sur le réseau. http:// n'est accepté que pour la machine locale (dev).
 * Retourne l'URL sans slash final, ou lance une Error lisible.
 */
export function validateServerUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('URL du serveur invalide.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new Error('HTTPS obligatoire (http:// seulement pour localhost).');
  }
  return u.origin + u.pathname.replace(/\/+$/, '');
}

/**
 * Le serveur renvoie des dates à précision variable ("…00Z", "…00.5Z", "…00.123456Z"). Comparées comme des chaînes elles seraient
 * mal ordonnées : on les ramène toutes au format ISO à la milliseconde.
 */
export function isoMs(s: string): string {
  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new SyncHttpError(502, `date invalide reçue : ${s}`);
  return new Date(t).toISOString();
}

export function normalizeLink(l: Link): Link {
  return { ...l, category: l.category ?? '', source: l.source ?? '', createdAt: isoMs(l.createdAt), updatedAt: isoMs(l.updatedAt), deletedAt: l.deletedAt === null ? null : isoMs(l.deletedAt) };
}

export function normalizeEvent(e: LinkEvent): LinkEvent {
  return { ...e, at: isoMs(e.at) };
}

export class HttpSyncApi implements SyncApi {
  private readonly base: string;

  constructor(
    serverUrl: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
    private readonly timeoutMs = 20_000,
  ) {
    this.base = validateServerUrl(serverUrl);
  }

  async putLink(link: Link): Promise<Link> {
    const r = await this.req(`/api/links/${link.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(link),
    });
    return normalizeLink((await r.json()) as Link);
  }

  async postEvent(event: LinkEvent): Promise<void> {
    await this.req('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
  }

  async putScreenshot(id: string, blob: Blob): Promise<void> {
    await this.req(`/api/screenshots/${id}`, { method: 'PUT', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob });
  }

  async getScreenshot(id: string): Promise<Blob | null> {
    try {
      return await (await this.req(`/api/screenshots/${id}`, { method: 'GET' })).blob();
    } catch (e) {
      if (e instanceof SyncHttpError && e.status === 404) return null;
      throw e;
    }
  }

  async pull(since: number): Promise<PullResult> {
    const body = (await (await this.req(`/api/sync?since=${since}`, { method: 'GET' })).json()) as PullResult;
    return { ...body, links: body.links.map(normalizeLink), events: body.events.map(normalizeEvent) };
  }

  private async req(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(this.base + path, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'X-Api-Token': this.token },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: 'no-store',
      });
    } catch {
      throw new SyncNetworkError('serveur injoignable');
    }
    if (res.status === 401 || res.status === 403) throw new SyncAuthError('jeton refusé');
    if (res.status === 429 || res.status >= 500) throw new SyncNetworkError(`HTTP ${res.status}`);
    if (!res.ok) throw new SyncHttpError(res.status, res.statusText);
    return res;
  }
}

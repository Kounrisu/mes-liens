import { Link } from './models';
import { libraryOf } from './library';
import { detectSource } from './catalog';

export type NodeKind = 'category' | 'source' | 'tag' | 'link';
export interface KnowledgeNode {
  id: string;
  label: string;
  value: string;
  kind: NodeKind;
  count: number;
  x: number;
  y: number;
  z: number;
}
export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
}
export const sourceOf = (link: Link) => link.source.trim() || detectSource(link.url)?.source || '';
export function nodeMatches(link: Link, node: KnowledgeNode): boolean {
  if (node.kind === 'link') return link.id === node.value;
  if (node.kind === 'source') return sourceOf(link).toLowerCase() === node.value.toLowerCase();
  if (node.kind === 'tag') return link.tags.includes(node.value);
  return (link.category || '_') === node.value || link.category.startsWith(node.value + ' / ');
}
const hash = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Actual stored relationships only. Round-robin sampling keeps small categories visible. */
export function knowledgeGraph(records: readonly Link[], limit = 90) {
  const links = records.filter((l) => !l.deletedAt && !libraryOf(l).archived && l.kind !== 'site');
  const buckets = new Map<string, Link[]>();
  for (const link of [...links].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  )) {
    const key = link.category || '_';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(link);
  }
  const groups = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sample: Link[] = [];
  for (let round = 0; sample.length < Math.max(0, limit); round++) {
    let added = false;
    for (const [, bucket] of groups) {
      if (bucket[round] && sample.length < limit) {
        sample.push(bucket[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();
  const addEdge = (from: string, to: string) => {
    const id = from + '→' + to;
    edges.set(id, { id, from, to });
  };
  const add = (kind: NodeKind, value: string, label: string) => {
    const id = kind + ':' + (kind === 'source' ? value.toLowerCase() : value);
    if (!nodes.has(id)) nodes.set(id, { id, kind, value, label, count: 0, x: 0, y: 0, z: 0 });
    return nodes.get(id)!;
  };
  const counts = new Map<string, number>();
  for (const l of links)
    for (const tag of l.tags)
      if (!/^import-|^reading list$|^saved tabs$|^liste-de-lecture$/.test(tag))
        counts.set(tag, (counts.get(tag) || 0) + 1);
  const tags = new Set(
    [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([tag]) => tag),
  );
  for (const l of sample) {
    const category = l.category || '_';
    const c = add('category', category, category === '_' ? 'non classé' : category);
    const node = add('link', l.id, l.title || l.domain);
    addEdge(c.id, node.id);
    const source = sourceOf(l);
    if (source) addEdge(add('source', source, source).id, node.id);
    for (const tag of l.tags.filter((t) => tags.has(t)).slice(0, 3))
      addEdge(add('tag', tag, tag).id, node.id);
  }
  const hubs = [...nodes.values()].filter((n) => n.kind === 'category');
  hubs.forEach((n, i) => {
    const theta = i * 2.399963229728653;
    const z = hubs.length === 1 ? 0 : 1 - (2 * (i + 0.5)) / hubs.length;
    const r = Math.sqrt(1 - z * z);
    n.x = Math.cos(theta) * r * 210;
    n.y = Math.sin(theta) * r * 180;
    n.z = z * 180;
  });
  const others = [...nodes.values()].filter((n) => n.kind === 'source' || n.kind === 'tag');
  others.forEach((n, i) => {
    const theta = (2 * Math.PI * i) / Math.max(1, others.length);
    n.x = Math.cos(theta) * 285;
    n.y = Math.sin(theta) * 220;
    n.z = n.kind === 'source' ? -95 : 110;
  });
  for (const link of sample) {
    const n = nodes.get('link:' + link.id)!;
    const hub = nodes.get('category:' + (link.category || '_'))!;
    const seed = hash(link.id),
      angle = ((seed % 360) * Math.PI) / 180,
      radius = 30 + (seed % 55);
    n.x = hub.x + Math.cos(angle) * radius;
    n.y = hub.y + Math.sin(angle) * radius;
    n.z = hub.z + (seed % 100) - 50;
  }
  for (const node of nodes.values())
    node.count = node.kind === 'link' ? 1 : links.filter((l) => nodeMatches(l, node)).length;
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    shown: sample.length,
    total: links.length,
  };
}

export function projectNode(node: KnowledgeNode, yaw: number, pitch: number, zoom: number) {
  const x = node.x * Math.cos(yaw) - node.z * Math.sin(yaw);
  const z = node.x * Math.sin(yaw) + node.z * Math.cos(yaw);
  const y = node.y * Math.cos(pitch) - z * Math.sin(pitch);
  const depth = node.y * Math.sin(pitch) + z * Math.cos(pitch);
  const scale = (700 / (800 + depth)) * zoom;
  return { ...node, px: 400 + x * scale, py: 285 + y * scale, depth, scale };
}

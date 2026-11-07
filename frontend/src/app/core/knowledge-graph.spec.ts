import { describe, expect, it } from 'vitest';
import { knowledgeGraph, nodeMatches, projectNode } from './knowledge-graph';
import { Link } from './models';
import { libraryOf } from './library';
const link = (id: string, category = 'formation / angular'): Link => ({
  id,
  category,
  url: 'https://example.com/' + id,
  title: id,
  domain: 'example.com',
  tags: ['angular'],
  note: '',
  source: '',
  kind: 'link',
  parentId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  screenshotId: null,
  focusRank: null,
});
describe('knowledge graph', () => {
  it('uses only active records and creates edges with real endpoints', () => {
    const active = { ...link('active'), source: 'YouTube' };
    const deleted = { ...link('deleted'), deletedAt: '2026-01-02T00:00:00Z' };
    const archived = { ...link('archived'), library: { ...libraryOf({}), archived: true } };
    const graph = knowledgeGraph([active, deleted, archived, { ...link('site'), kind: 'site' }]);
    expect(graph.total).toBe(1);
    expect(graph.nodes.some((n) => n.value === 'deleted')).toBe(false);
    expect(graph.nodes.find((n) => n.id === 'source:youtube')?.count).toBe(1);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(graph.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
  });
  it('keeps a small category represented when sampling a large library', () => {
    const records = [
      ...Array.from({ length: 100 }, (_, i) => link('a' + i, 'autre')),
      link('small', 'formation / java'),
    ];
    const graph = knowledgeGraph(records, 4);
    expect(graph.shown).toBe(4);
    expect(graph.total).toBe(101);
    expect(graph.nodes.some((n) => n.id === 'link:small')).toBe(true);
    expect(knowledgeGraph(records, 4)).toEqual(graph);
  });
  it('matches hierarchical categories and merges source names without case duplicates', () => {
    const graph = knowledgeGraph([
      { ...link('a'), source: 'YouTube' },
      { ...link('b'), source: 'youtube' },
    ]);
    expect(graph.nodes.filter((n) => n.kind === 'source')).toHaveLength(1);
    const category = graph.nodes.find((n) => n.kind === 'category')!;
    expect(nodeMatches(link('c', 'formation / angular / signals'), category)).toBe(true);
    expect(nodeMatches(link('d', 'formation / java'), category)).toBe(false);
  });
  it('rotates depth into the screen and keeps finite coordinates at allowed zoom', () => {
    const node = knowledgeGraph([link('a')]).nodes[0];
    const before = projectNode({ ...node, x: 100, y: 0, z: 0 }, 0, 0, 1);
    const after = projectNode({ ...node, x: 100, y: 0, z: 0 }, Math.PI / 2, 0, 1);
    expect(before.px).toBeGreaterThan(400);
    expect(after.px).toBeCloseTo(400);
    expect(after.depth).toBeCloseTo(100);
    expect([after.px, after.py, after.scale].every(Number.isFinite)).toBe(true);
    expect(knowledgeGraph([], 90).nodes).toEqual([]);
  });
});

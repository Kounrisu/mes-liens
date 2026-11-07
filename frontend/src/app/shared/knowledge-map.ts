import { Component, computed, input, output, signal } from '@angular/core';
import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { Link } from '../core/models';
import { knowledgeGraph, KnowledgeNode, projectNode } from '../core/knowledge-graph';

@Component({
  selector: 'app-knowledge-map',
  imports: [TranslatePipe, CategoryLabelPipe],
  styleUrl: './knowledge-map.css',
  template: `<div class="map-wrap">
    <div class="map-toolbar">
      <span class="map-label">{{ 'Carte 3D' | t }}</span>
      <div class="map-controls">
        <button type="button" (click)="rotate(-0.22, 0)" [attr.aria-label]="'Pivoter à gauche' | t">
          ←
        </button>
        <button type="button" (click)="rotate(0.22, 0)" [attr.aria-label]="'Pivoter à droite' | t">
          →
        </button>
        <button
          type="button"
          (click)="rotate(0, -0.18)"
          [attr.aria-label]="'Pivoter vers le haut' | t"
        >
          ↑
        </button>
        <button
          type="button"
          (click)="rotate(0, 0.18)"
          [attr.aria-label]="'Pivoter vers le bas' | t"
        >
          ↓
        </button>
        <button
          type="button"
          (click)="changeZoom(0.15)"
          [attr.aria-label]="'Agrandir la carte' | t"
        >
          +
        </button>
        <button
          type="button"
          (click)="changeZoom(-0.15)"
          [attr.aria-label]="'Réduire la carte' | t"
        >
          −
        </button>
        <button type="button" (click)="reset()">{{ 'Recentrer' | t }}</button>
      </div>
    </div>
    <svg
      viewBox="0 0 800 570"
      role="group"
      tabindex="0"
      [attr.aria-label]="'Carte des liens : flèches pour tourner, plus et moins pour zoomer.' | t"
      (pointerdown)="start($event)"
      (pointermove)="move($event)"
      (pointerup)="end($event)"
      (pointercancel)="end($event)"
      (wheel)="wheel($event)"
      (keydown)="key($event)"
    >
      <defs>
        <pattern id="map-dots" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".7" class="grid-dot" />
        </pattern>
      </defs>
      <rect width="800" height="570" fill="url(#map-dots)" />
      @for (edge of projectedEdges(); track edge.id) {
        <line
          [attr.x1]="edge.a.px"
          [attr.y1]="edge.a.py"
          [attr.x2]="edge.b.px"
          [attr.y2]="edge.b.py"
          [class.connected]="edge.from === focused() || edge.to === focused()"
          [class.dim]="focused() && edge.from !== focused() && edge.to !== focused()"
        />
      }
      @for (node of projected(); track node.id) {
        <g
          role="button"
          [attr.tabindex]="node.kind === 'link' ? -1 : 0"
          [attr.aria-label]="node.label + ' · ' + node.count"
          [attr.transform]="'translate(' + node.px + ',' + node.py + ')'"
          [attr.class]="'node ' + node.kind + (selected() === node.id ? ' selected' : '')"
          (mouseenter)="hover.set(node.id)"
          (mouseleave)="hover.set('')"
          (focus)="hover.set(node.id)"
          (blur)="hover.set('')"
          (click)="choose(node)"
          (keydown.enter)="choose(node); $event.stopPropagation()"
          (keydown.space)="choose(node); $event.preventDefault(); $event.stopPropagation()"
        >
          <title>{{ node.label }} · {{ node.count }}</title>
          <circle class="hit" r="22" />
          @if (node.kind === 'source') {
            <rect x="-8" y="-8" width="16" height="16" rx="4" class="mark" />
          } @else {
            <circle
              class="mark"
              [attr.r]="
                node.kind === 'link'
                  ? 3.5 + node.scale * 2
                  : 8 + Math.min(6, Math.log2(node.count + 1))
              "
            />
          }
          @if (node.kind !== 'link' || focused() === node.id) {
            <text [attr.y]="node.kind === 'link' ? -15 : -22" text-anchor="middle">
              {{ node.kind === 'tag' ? '#' : ''
              }}{{
                node.kind === 'category' ? (short(node.label) | categoryLabel) : short(node.label)
              }}
            </text>
          }
        </g>
      }
      @if (!graph().shown) {
        <text x="400" y="280" text-anchor="middle" class="empty-map">
          {{ 'Aucun lien pour ces filtres.' | t }}
        </text>
      }
    </svg>
    <div class="map-footer">
      <div class="legend">
        <span class="category">● {{ 'Catégories' | t }}</span
        ><span class="source">■ {{ 'Sources' | t }}</span
        ><span class="tag"># {{ 'Mots-clés' | t }}</span
        ><span>• {{ 'Liens' | t }}</span>
      </div>
      <small>{{
        '{0} liens représentés sur {1}. Filtre pour explorer une zone.'
          | t: [graph().shown, graph().total]
      }}</small>
    </div>
    <p class="map-help">
      {{
        'Glisse pour tourner, utilise la molette pour zoomer. Clique sur un point pour voir ses liens.'
          | t
      }}
    </p>
  </div>`,
})
export class KnowledgeMap {
  readonly links = input.required<Link[]>();
  readonly selected = input('');
  readonly pick = output<KnowledgeNode>();
  readonly graph = computed(() => knowledgeGraph(this.links()));
  readonly yaw = signal(-0.15);
  readonly pitch = signal(0.08);
  readonly zoom = signal(1);
  readonly hover = signal('');
  readonly focused = computed(() => this.hover() || this.selected());
  readonly Math = Math;
  readonly projected = computed(() =>
    this.graph()
      .nodes.map((n) => projectNode(n, this.yaw(), this.pitch(), this.zoom()))
      .sort((a, b) => b.depth - a.depth),
  );
  readonly projectedEdges = computed(() => {
    const nodes = new Map(this.projected().map((n) => [n.id, n]));
    return this.graph().edges.map((e) => ({ ...e, a: nodes.get(e.from)!, b: nodes.get(e.to)! }));
  });
  private drag: { x: number; y: number; id: number } | null = null;
  private moved = false;
  short(s: string) {
    return s.length > 30 ? s.slice(0, 28) + '…' : s;
  }
  rotate(x: number, y: number) {
    this.yaw.update((v) => v + x);
    this.pitch.update((v) => Math.max(-1.3, Math.min(1.3, v + y)));
  }
  changeZoom(delta: number) {
    this.zoom.update((v) => Math.max(0.45, Math.min(2.5, v + delta)));
  }
  reset() {
    this.yaw.set(-0.15);
    this.pitch.set(0.08);
    this.zoom.set(1);
  }
  start(e: PointerEvent) {
    if (e.button !== 0) return;
    this.moved = false;
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  move(e: PointerEvent) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.x,
      dy = e.clientY - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    this.moved = true;
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    this.rotate(dx * 0.006, dy * 0.006);
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  end(e: PointerEvent) {
    if ((e.currentTarget as SVGElement).hasPointerCapture(e.pointerId))
      (e.currentTarget as SVGElement).releasePointerCapture(e.pointerId);
    this.drag = null;
  }
  choose(n: KnowledgeNode) {
    if (!this.moved) this.pick.emit(n);
    this.moved = false;
  }
  wheel(e: WheelEvent) {
    e.preventDefault();
    this.changeZoom(e.deltaY > 0 ? -0.07 : 0.07);
  }
  key(e: KeyboardEvent) {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.rotate(-0.15, 0),
      ArrowRight: () => this.rotate(0.15, 0),
      ArrowUp: () => this.rotate(0, -0.15),
      ArrowDown: () => this.rotate(0, 0.15),
      '+': () => this.changeZoom(0.15),
      '=': () => this.changeZoom(0.15),
      '-': () => this.changeZoom(-0.15),
      Home: () => this.reset(),
    };
    if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]();
    }
  }
}

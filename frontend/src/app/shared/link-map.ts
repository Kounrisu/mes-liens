import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { KnowledgeNode, nodeMatches } from '../core/knowledge-graph';
import { libraryOf } from '../core/library';
import { Link } from '../core/models';
import { KnowledgeMap } from './knowledge-map';
import { LinkRows } from './link-rows';

@Component({
  selector: 'app-link-map',
  imports: [KnowledgeMap, LinkRows, RouterLink, TranslatePipe, CategoryLabelPipe],
  template: `
    <app-knowledge-map
      [links]="links()"
      [selected]="selected()?.id || ''"
      (pick)="selected.set($event)"
    />
    @if (selection(); as node) {
      <section class="card" [attr.aria-label]="'Détails de la sélection' | t">
        <div class="row">
          <h3>{{ node.kind === 'category' ? (node.label | categoryLabel) : node.label }}</h3>
          <button type="button" (click)="selected.set(null)">{{ 'Tous les liens' | t }}</button>
        </div>
        @if (selectedLink(); as link) {
          @if (lib(link).creator) {
            <p class="meta">{{ lib(link).creator }}</p>
          }
          @if (lib(link).description) {
            <p>{{ lib(link).description }}</p>
          }
          @if (link.note) {
            <p>{{ link.note }}</p>
          }
          <div class="row">
            <a class="btn" [href]="link.url" target="_blank" rel="noopener noreferrer"
              >{{ 'Ouvrir le lien' | t }} ↗</a
            >
            <a class="btn" [routerLink]="['/link', link.id, 'edit']">{{ 'Modifier' | t }}</a>
          </div>
        }
      </section>
    }
    <app-link-rows [links]="related()" [filters]="false" />
  `,
  styles: [':host { display: grid; min-width: 0; gap: 1rem; }'],
})
export class LinkMap {
  readonly links = input.required<Link[]>();
  readonly selected = signal<KnowledgeNode | null>(null);
  readonly lib = libraryOf;
  readonly selection = computed(() => {
    const node = this.selected();
    return node && this.links().some((l) => nodeMatches(l, node)) ? node : null;
  });
  readonly related = computed(() =>
    this.selection() ? this.links().filter((l) => nodeMatches(l, this.selection()!)) : this.links(),
  );
  readonly selectedLink = computed(() =>
    this.selection()?.kind === 'link' ? this.related()[0] : undefined,
  );
}

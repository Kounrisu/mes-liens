import { TranslatePipe, LocalDatePipe } from '../core/i18n';
import { FavoriteButton } from './favorite-button';
import { SelectionToolbar, toggleSelection } from './selection-toolbar';
import { Component, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { Link } from '../core/models';
import { FocusButton } from './focus-button';

const PAGE_SIZE = 150;
const NO_SOURCE = 'sans source';

/** Vues compactes : liste d'une ligne par lien, ou regroupement par source (Udemy, YouTube…). */
@Component({
  selector: 'app-link-rows',
  imports: [
    TranslatePipe,
    FavoriteButton,
    SelectionToolbar,
    LocalDatePipe,
    NgTemplateOutlet,
    RouterLink,
    FocusButton,
  ],
  template: `
    @if (filters()) {
      <div class="filters">
        <input
          type="search"
          [placeholder]="'Rechercher…' | t"
          [attr.aria-label]="'Rechercher' | t"
          [value]="query()"
          (input)="setQuery(val($event))"
        />
      </div>
    }
    <p class="meta" aria-live="polite">
      {{ '{0} lien{1}' | t: [visible().length, visible().length > 1 ? 's' : ''] }}
    </p>

    <app-selection-toolbar [links]="visible()" [shown]="shown()" [(selected)]="selected" />
    @if (!svc.ready()) {
      <p>{{ 'Chargement…' | t }}</p>
    } @else if (visible().length === 0) {
      <p class="empty">{{ 'Aucun lien ne correspond.' | t }}</p>
    }

    @if (grouped()) {
      @for (g of groups(); track g.name) {
        <details class="group" open>
          <summary>
            {{ g.name === 'sans source' ? ('sans source' | t) : g.name }}
            <small class="meta">{{ g.items.length }}</small>
          </summary>
          <ul class="rows">
            @for (l of g.items; track l.id) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: l }" />
            }
          </ul>
        </details>
      }
    } @else {
      <ul class="rows">
        @for (l of shown(); track l.id) {
          <ng-container *ngTemplateOutlet="row; context: { $implicit: l }" />
        }
      </ul>
    }
    @if (visible().length > shown().length) {
      <p class="more">
        <button type="button" (click)="more()">
          {{ 'Afficher plus ({0} restants)' | t: [visible().length - shown().length] }}
        </button>
      </p>
    }

    <ng-template #row let-l>
      <li class="rowitem" [class.picked]="selected().has(l.id)">
        <input
          class="selection-check"
          type="checkbox"
          [checked]="selected().has(l.id)"
          (change)="toggle(l.id)"
          [attr.aria-label]="'Sélectionner ' + l.title | t"
        />
        <a class="t" [href]="l.url" target="_blank" rel="noopener noreferrer">{{ l.title }}</a>
        @if (l.kind === 'site') {
          <span class="badge"> {{ 'site' | t }} </span>
        }
        <span class="meta"
          >{{ grouped() ? l.domain : l.source || l.domain }} ·
          {{ l.createdAt | localDate: 'dd/MM/yyyy' }}</span
        >
        @for (t of l.tags; track t) {
          <span class="badge">{{ t }}</span>
        }
        <span class="spacer"></span>
        <a
          class="btn small"
          [routerLink]="['/link', l.id]"
          [attr.aria-label]="'Ouvrir la fiche de ' + l.title | t"
        >
          {{ 'Ouvrir' | t }}
        </a>
        <app-favorite-button [link]="l" /><app-focus-button [link]="l" />
      </li>
    </ng-template>
  `,
})
export class LinkRows {
  protected readonly svc = inject(LinkService);

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected toggle(id: string): void {
    this.selected.update((s) => toggleSelection(s, id));
  }

  readonly links = input.required<Link[]>();
  /** true : regroupé par source ; false : simple liste. */
  readonly grouped = input(false);
  readonly filters = input(true);

  protected readonly query = signal('');
  protected readonly limit = signal(PAGE_SIZE);
  protected readonly visible = computed(() => filterLinks(this.links(), this.query(), []));
  protected readonly shown = computed(() => this.visible().slice(0, this.limit()));

  protected readonly groups = computed(() => {
    const by = new Map<string, Link[]>();
    for (const l of this.shown()) {
      const key = l.source || NO_SOURCE;
      by.set(key, [...(by.get(key) ?? []), l]);
    }
    return [...by]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) =>
        a.name === NO_SOURCE
          ? 1
          : b.name === NO_SOURCE
            ? -1
            : a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
      );
  });

  protected setQuery(v: string): void {
    this.query.set(v);
    this.selected.set(new Set());
    this.limit.set(PAGE_SIZE);
  }

  protected more(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

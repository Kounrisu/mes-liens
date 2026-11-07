import { TranslatePipe } from '../core/i18n';
import { Component, computed, input, signal } from '@angular/core';
import { Link } from '../core/models';
import { LinkList } from './link-list';
import { LinkRows } from './link-rows';
import { LinksTable } from './links-table';
import { LinkMap } from './link-map';
import { filterLinks, tagCounts } from '../core/link-utils';

export type ViewMode = 'cards' | 'list' | 'table' | 'sources' | 'map';

const KEY = 'mesliens.view';
export const VIEW_MODES: readonly { mode: ViewMode; label: string }[] = [
  { mode: 'cards', label: 'Cartes' },
  { mode: 'list', label: 'Liste' },
  { mode: 'table', label: 'Tableau' },
  { mode: 'sources', label: 'Par source' },
  { mode: 'map', label: 'Carte 3D' },
];

function savedMode(): ViewMode {
  try {
    const v = localStorage.getItem(KEY);
    return VIEW_MODES.some((m) => m.mode === v) ? (v as ViewMode) : 'cards';
  } catch {
    return 'cards'; // stockage indisponible (navigation privée…) : valeur par défaut
  }
}

/** Plusieurs façons de voir les mêmes liens : cartes, liste compacte, tableau, regroupé par source. Le choix est mémorisé sur l'appareil. */
@Component({
  selector: 'app-link-views',
  imports: [TranslatePipe, LinkList, LinkRows, LinksTable, LinkMap],
  styles: [':host { display: block; min-width: 0; } .view-switch button { min-height: 44px; }'],
  template: `
    @if (showSwitch()) {
      <div class="view-switch" role="group" [attr.aria-label]="'Mode d\\'affichage' | t">
        @for (m of modes; track m.mode) {
          <button
            type="button"
            [class.on]="mode() === m.mode"
            [attr.aria-pressed]="mode() === m.mode"
            (click)="set(m.mode)"
          >
            {{ m.label | t }}
          </button>
        }
      </div>
    }
    @if (filters()) {
      <div class="filters">
        <input
          type="search"
          [attr.aria-label]="'Rechercher' | t"
          [placeholder]="'Rechercher…' | t"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
        <select
          [attr.aria-label]="'Filtrer par source' | t"
          [value]="source()"
          (change)="source.set($any($event.target).value)"
        >
          <option value="">{{ 'Toutes les sources' | t }}</option>
          @for (s of sources(); track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
        <select
          [attr.aria-label]="'Filtrer par étiquette' | t"
          [value]="tag()"
          (change)="tag.set($any($event.target).value)"
        >
          <option value="">{{ 'Toutes les étiquettes' | t }}</option>
          @for (t of tags(); track t.tag) {
            <option [value]="t.tag">{{ t.tag }} ({{ t.count }})</option>
          }
        </select>
        @if (query() || tag() || source()) {
          <button type="button" (click)="query.set(''); tag.set(''); source.set('')">
            {{ 'Effacer les filtres' | t }}
          </button>
        }
      </div>
      <p class="meta" role="status">
        {{ '{0} résultat{1}' | t: [visible().length, visible().length > 1 ? 's' : ''] }}
      </p>
    }
    @switch (mode()) {
      @case ('list') {
        <app-link-rows [links]="visible()" [filters]="false" />
      }
      @case ('sources') {
        <app-link-rows [links]="visible()" [grouped]="true" [filters]="false" />
      }
      @case ('table') {
        <app-links-table [links]="visible()" [filters]="false" />
      }
      @case ('map') {
        @defer (on immediate) {
          <app-link-map [links]="visible()" />
        } @placeholder {
          <p role="status">{{ 'Chargement…' | t }}</p>
        }
      }
      @default {
        <app-link-list [links]="visible()" [filters]="false" />
      }
    }
  `,
})
export class LinkViews {
  readonly links = input.required<Link[]>();
  readonly filters = input(true);
  readonly showSwitch = input(true);
  readonly viewMode = input<ViewMode>();
  protected readonly query = signal('');
  protected readonly tag = signal('');
  protected readonly source = signal('');
  protected readonly sources = computed(() =>
    [
      ...new Set(
        this.links()
          .map((l) => l.source)
          .filter(Boolean),
      ),
    ].sort(),
  );
  protected readonly tags = computed(() => tagCounts(this.links()));
  protected readonly visible = computed(() =>
    filterLinks(this.links(), this.query(), this.tag() ? [this.tag()] : []).filter(
      (l) => !this.source() || l.source === this.source(),
    ),
  );

  protected readonly modes = VIEW_MODES;
  private readonly preference = signal<ViewMode>(savedMode());
  protected readonly mode = computed(() => this.viewMode() ?? this.preference());

  protected set(m: ViewMode): void {
    this.preference.set(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* non mémorisé : sans conséquence */
    }
  }
}

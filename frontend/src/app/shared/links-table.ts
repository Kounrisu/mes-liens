import { I18nService, CategoryLabelPipe, TranslatePipe, LocalDatePipe } from '../core/i18n';
import { FavoriteButton } from './favorite-button';
import { SelectionToolbar } from './selection-toolbar';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SortDir, SortKey, sortLinks } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { filterLinks, tagCounts } from '../core/link-utils';
import { Link } from '../core/models';
import { FocusButton } from './focus-button';
import { libraryOf, LEARNING_STATES } from '../core/library';
import { InsightsService, HEALTH_LABELS } from '../core/insights.service';

const PAGE_SIZE = 100;

interface Column {
  key: SortKey;
  label: string;
}

/** Tableau de liens : tri sur chaque colonne, recherche, pagination « afficher plus », actions (ouvrir, modifier, supprimer). */
@Component({
  selector: 'app-links-table',
  imports: [
    CategoryLabelPipe,
    TranslatePipe,
    FavoriteButton,
    SelectionToolbar,
    LocalDatePipe,
    RouterLink,
    FocusButton,
  ],
  templateUrl: './links-table.html',
})
export class LinksTable {
  protected readonly i18n = inject(I18nService);
  protected readonly svc = inject(LinkService);
  protected readonly insights = inject(InsightsService);
  protected readonly healthLabels = HEALTH_LABELS;
  readonly links = input.required<Link[]>();
  /** false : pas de champ de recherche (la page parente filtre elle-même). */
  readonly searchable = input(true);

  protected readonly columns: Column[] = [
    { key: 'title', label: 'Titre' },
    { key: 'source', label: 'Source' },
    { key: 'category', label: 'Catégorie' },
    { key: 'createdAt', label: 'Créé' },
    { key: 'updatedAt', label: 'Modifié' },
  ];

  protected readonly query = signal('');
  protected readonly sortKey = signal<SortKey>('createdAt');
  protected readonly sortDir = signal<SortDir>('desc');

  protected readonly source = signal('');
  protected readonly tag = signal('');
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly libraryOf = libraryOf;
  protected readonly states = LEARNING_STATES;

  protected readonly sources = computed(() =>
    [
      ...new Set(
        this.links()
          .map((l) => l.source)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
  );
  protected readonly tags = computed(() => tagCounts(this.links()));

  /** Tous les liens qui passent les filtres (pas seulement la page affichée) : c'est sur eux que « tout sélectionner » agit. */
  protected readonly rows = computed(() => {
    const bySource = this.source()
      ? this.links().filter((l) => l.source === this.source())
      : this.links();
    return sortLinks(
      filterLinks(bySource, this.query(), this.tag() ? [this.tag()] : []),
      this.sortKey(),
      this.sortDir(),
    );
  });
  /** Sélection réellement visible : un lien coché puis écarté par un filtre n'est JAMAIS supprimé par le lot. */
  protected readonly picked = computed(() => this.rows().filter((l) => this.selected().has(l.id)));
  protected readonly allPicked = computed(
    () => this.rows().length > 0 && this.picked().length === this.rows().length,
  );

  protected readonly limit = signal(PAGE_SIZE);
  protected readonly shownRows = computed(() => this.rows().slice(0, this.limit()));

  protected more(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  protected setQuery(v: string): void {
    this.query.set(v);
    this.resetView();
  }

  protected setSource(v: string): void {
    this.source.set(v);
    this.resetView();
  }

  protected setTag(v: string): void {
    this.tag.set(v);
    this.resetView();
  }

  protected resetFilters(): void {
    this.query.set('');
    this.source.set('');
    this.tag.set('');
    this.resetView();
  }

  /** Un filtre change : retour à la première page et sélection vidée (jamais d'action sur des lignes qu'on ne voit plus). */
  private resetView(): void {
    this.limit.set(PAGE_SIZE);
    this.selected.set(new Set());
  }

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  /** Coche (ou décoche) TOUS les liens filtrés, y compris ceux des pages pas encore affichées. */
  protected toggleAll(): void {
    this.selected.set(this.allPicked() ? new Set() : new Set(this.rows().map((l) => l.id)));
  }

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      this.sortKey.set(key);
      this.sortDir.set(key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc'); // dates : récent d'abord
    }
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  protected arrow(key: SortKey): string {
    return this.sortKey() !== key ? '↕' : this.sortDir() === 'asc' ? '▲' : '▼';
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected async remove(l: Link): Promise<void> {
    if (!confirm(this.i18n.t(`Supprimer « ${l.title} » ?`))) return;
    await this.svc.remove(l.id);
    this.selected.update((s) => {
      const n = new Set(s);
      n.delete(l.id);
      return n;
    });
  }
}

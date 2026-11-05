import { I18nService, CategoryLabelPipe, TranslatePipe, LocalDatePipe } from '../core/i18n';
import { FavoriteButton } from './favorite-button';
import { SelectionToolbar, toggleSelection } from './selection-toolbar';
import { LinkInsight } from './link-insight';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { SyncService } from '../core/sync.service';
import { filterLinks, tagCounts } from '../core/link-utils';
import { Link } from '../core/models';
import { FocusButton } from './focus-button';

const PAGE_SIZE = 48;

/** Liste en cartes avec recherche et filtre par étiquettes. Utilisée par l'accueil et les pages de catégorie. */
@Component({
  selector: 'app-link-list',
  imports: [
    CategoryLabelPipe,
    TranslatePipe,
    FavoriteButton,
    SelectionToolbar,
    LinkInsight,
    LocalDatePipe,
    RouterLink,
    FocusButton,
  ],
  templateUrl: './link-list.html',
})
export class LinkList {
  protected readonly i18n = inject(I18nService);
  protected readonly svc = inject(LinkService);
  protected readonly sync = inject(SyncService);

  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected toggle(id: string): void {
    this.selected.update((s) => toggleSelection(s, id));
  }

  readonly links = input.required<Link[]>();
  /** false : pas de recherche ni d'étiquettes (la page parente filtre elle-même). */
  readonly filters = input(true);

  protected readonly query = signal('');
  protected readonly activeTags = signal<string[]>([]);
  protected readonly visible = computed(() =>
    filterLinks(this.links(), this.query(), this.activeTags()),
  );
  protected readonly allTags = computed(() => tagCounts(this.links()));

  /** Pagination « afficher plus » : 2 000 cartes d'un coup ralentiraient l'écran. Remise à zéro quand les filtres changent. */
  protected readonly limit = signal(PAGE_SIZE);
  protected readonly shown = computed(() => this.visible().slice(0, this.limit()));

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected setQuery(v: string): void {
    this.query.set(v);
    this.selected.set(new Set());
    this.limit.set(PAGE_SIZE);
  }

  protected more(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  protected toggleTag(tag: string): void {
    this.selected.set(new Set());
    this.limit.set(PAGE_SIZE);
    this.activeTags.update((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  protected resetFilters(): void {
    this.selected.set(new Set());
    this.limit.set(PAGE_SIZE);
    this.query.set('');
    this.activeTags.set([]);
  }

  protected catParam(l: Link): string {
    return l.category || '_';
  }

  protected async remove(l: Link): Promise<void> {
    if (confirm(this.i18n.t(`Supprimer « ${l.title} » ?`))) await this.svc.remove(l.id);
  }
}

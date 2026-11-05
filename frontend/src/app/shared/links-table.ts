import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SortDir, SortKey, sortLinks } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { Link } from '../core/models';
import { FocusButton } from './focus-button';

const PAGE_SIZE = 100;

interface Column {
  key: SortKey;
  label: string;
}

/** Tableau de liens : tri sur chaque colonne, recherche, pagination « afficher plus », actions (ouvrir, modifier, supprimer). */
@Component({
  selector: 'app-links-table',
  imports: [DatePipe, RouterLink, FocusButton],
  templateUrl: './links-table.html',
})
export class LinksTable {
  protected readonly svc = inject(LinkService);

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

  protected readonly rows = computed(() => sortLinks(filterLinks(this.links(), this.query(), []), this.sortKey(), this.sortDir()));
  protected readonly limit = signal(PAGE_SIZE);
  protected readonly shownRows = computed(() => this.rows().slice(0, this.limit()));

  protected more(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  protected setQuery(v: string): void {
    this.query.set(v);
    this.limit.set(PAGE_SIZE);
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
    if (confirm(`Supprimer « ${l.title} » ?`)) await this.svc.remove(l.id);
  }
}

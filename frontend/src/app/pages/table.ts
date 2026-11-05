import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SortDir, SortKey, UNCATEGORIZED, categoryCounts, sortLinks } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { Link } from '../core/models';
import { FocusButton } from '../shared/focus-button';

interface Column {
  key: SortKey;
  label: string;
}

/** Tableau global : tri sur chaque colonne, recherche, filtre par catégorie, et actions (ouvrir, modifier, supprimer). */
@Component({
  selector: 'app-table',
  imports: [DatePipe, RouterLink, FocusButton],
  templateUrl: './table.html',
})
export class TablePage {
  protected readonly svc = inject(LinkService);

  /** ?category=… (depuis une page de catégorie). `_` = non classé. */
  readonly category = input<string>('');

  protected readonly columns: Column[] = [
    { key: 'title', label: 'Titre' },
    { key: 'source', label: 'Source' },
    { key: 'category', label: 'Catégorie' },
    { key: 'createdAt', label: 'Créé' },
    { key: 'updatedAt', label: 'Modifié' },
  ];
  protected readonly uncategorized = UNCATEGORIZED;

  protected readonly query = signal('');
  protected readonly categoryOverride = signal<string | null>(null);
  protected readonly sortKey = signal<SortKey>('createdAt');
  protected readonly sortDir = signal<SortDir>('desc');

  // withComponentInputBinding lie `undefined` (pas '') quand le paramètre d'URL est absent.
  protected readonly categoryFilter = computed(() => this.categoryOverride() ?? this.category() ?? '');
  protected readonly categories = computed(() => categoryCounts(this.svc.links()));

  protected readonly rows = computed(() => {
    const cat = this.categoryFilter();
    const base = cat === '' ? this.svc.links() : this.svc.links().filter((l) => l.category === (cat === '_' ? '' : cat));
    return sortLinks(filterLinks(base, this.query(), []), this.sortKey(), this.sortDir());
  });

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
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected async remove(l: Link): Promise<void> {
    if (confirm(`Supprimer « ${l.title} » ?`)) await this.svc.remove(l.id);
  }
}

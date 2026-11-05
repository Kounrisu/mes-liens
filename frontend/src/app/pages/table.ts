import { Component, computed, inject, input, signal } from '@angular/core';
import { UNCATEGORIZED, categoryCounts } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { LinksTable } from '../shared/links-table';

/** Tableau global : filtre par catégorie ; tri, recherche et actions sont dans le composant partagé. */
@Component({
  selector: 'app-table',
  imports: [LinksTable],
  templateUrl: './table.html',
})
export class TablePage {
  protected readonly svc = inject(LinkService);

  /** ?category=… (depuis une page de catégorie). `_` = non classé. */
  readonly category = input<string>('');

  protected readonly uncategorized = UNCATEGORIZED;
  protected readonly categoryOverride = signal<string | null>(null);

  // withComponentInputBinding lie `undefined` (pas '') quand le paramètre d'URL est absent.
  protected readonly categoryFilter = computed(
    () => this.categoryOverride() ?? this.category() ?? '',
  );
  protected readonly categories = computed(() => categoryCounts(this.svc.activeLinks()));

  protected readonly rows = computed(() => {
    const cat = this.categoryFilter();
    return cat === ''
      ? this.svc.activeLinks()
      : this.svc.activeLinks().filter((l) => l.category === (cat === '_' ? '' : cat));
  });

  protected val(e: Event): string {
    return (e.target as HTMLSelectElement).value;
  }
}

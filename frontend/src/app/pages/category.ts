import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UNCATEGORIZED } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { LinkList } from '../shared/link-list';

/** Une page par catégorie. `_` désigne les liens sans catégorie. */
@Component({
  selector: 'app-category',
  imports: [LinkList, RouterLink],
  template: `
    <main class="page">
      <section aria-labelledby="cat-h">
        <h2 id="cat-h">{{ label() }} <small class="meta">· {{ links().length }} lien{{ links().length > 1 ? 's' : '' }}</small></h2>
        <p class="meta"><a [routerLink]="['/table']" [queryParams]="{ category: name() }">Voir dans le tableau</a></p>
        <app-link-list [links]="links()" />
      </section>
    </main>
  `,
})
export class CategoryPage {
  private readonly svc = inject(LinkService);

  /** Paramètre de route (lié par withComponentInputBinding). */
  readonly name = input.required<string>();

  protected readonly category = computed(() => (this.name() === '_' ? '' : this.name()));
  protected readonly label = computed(() => this.category() || UNCATEGORIZED);
  protected readonly links = computed(() => this.svc.links().filter((l) => l.category === this.category()));
}

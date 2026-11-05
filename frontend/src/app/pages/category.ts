import { Component, computed, inject, input } from '@angular/core';
import { UNCATEGORIZED } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { LinkViews } from '../shared/link-views';

/** Une page par catégorie. `_` désigne les liens sans catégorie. */
@Component({
  selector: 'app-category',
  imports: [LinkViews],
  template: `
    <main class="page">
      <section aria-labelledby="cat-h">
        <h2 id="cat-h">{{ label() }} <small class="meta">· {{ links().length }} lien{{ links().length > 1 ? 's' : '' }}</small></h2>
        <app-link-views [links]="links()" />
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

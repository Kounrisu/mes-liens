import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { LinkService } from '../core/link.service';
import { sourcesOf, sourceKey } from '../core/sources';
import { detectSource } from '../core/catalog';
import { categoryPaths, categoryWithin, libraryOf } from '../core/library';
import { LinkViews } from '../shared/link-views';

@Component({
  imports: [TranslatePipe, CategoryLabelPipe, RouterLink, LinkViews],
  template: `<main class="page">
    <a routerLink="/sources">{{ '← Toutes les sources' | t }}</a>
    <section class="library-heading">
      <div>
        <h2>{{ heading() | t }}</h2>
        <p class="meta">
          {{ '{0} lien(s)' | t: [links().length] }} · {{ '{0} formation(s)' | t: [courses()] }}
        </p>
      </div>
      <a class="btn" routerLink="/" [queryParams]="{ source: entry()?.name || name() }">{{
        'Enregistrer un lien' | t
      }}</a>
    </section>
    <section class="card">
      <div class="cols">
        <label
          >{{ 'Type de ressource' | t
          }}<select [value]="type()" (change)="type.set(text($event))">
            <option value="">{{ 'Tous les liens' | t }}</option>
            <option value="course">{{ 'Formations uniquement' | t }}</option>
          </select></label
        >
        <label
          >{{ 'Catégorie et sous-catégories' | t
          }}<select [value]="category()" (change)="category.set(text($event))">
            <option value="">{{ 'Toutes les catégories' | t }}</option>
            @for (c of categories(); track c) {
              <option [value]="c">{{ c | categoryLabel }}</option>
            }
          </select></label
        >
      </div>
      <app-link-views [links]="filtered()" />
    </section>
  </main>`,
})
export class SourcePage {
  readonly name = input.required<string>();
  readonly heading = computed(
    () =>
      ({
        facebook: 'Facebook enregistrés',
        instagram: 'Instagram enregistrés',
        x: 'X enregistrés',
      })[this.name().toLowerCase()] ||
      this.entry()?.name ||
      this.name(),
  );
  private readonly svc = inject(LinkService);
  readonly entry = computed(() =>
    sourcesOf(this.svc.activeLinks()).find((s) => s.key === sourceKey(this.name())),
  );
  readonly links = computed(() => {
    const records = this.entry()?.links ?? [];
    const ids = new Set(records.map((l) => l.id));
    return [
      ...records,
      ...this.svc
        .activeLinks()
        .filter(
          (l) =>
            l.kind !== 'site' &&
            !ids.has(l.id) &&
            !l.source.trim() &&
            sourceKey(detectSource(l.url)?.source ?? '') === sourceKey(this.name()),
        ),
    ];
  });
  readonly courses = computed(
    () =>
      this.links().filter(
        (l) => libraryOf(l).resourceType === 'course' || categoryWithin(l.category, 'formation'),
      ).length,
  );
  readonly categories = computed(() => categoryPaths(this.links()));
  readonly type = signal('');
  readonly category = signal('');
  readonly filtered = computed(() =>
    this.links().filter(
      (l) =>
        (!this.type() ||
          libraryOf(l).resourceType === 'course' ||
          categoryWithin(l.category, 'formation')) &&
        (!this.category() || categoryWithin(l.category, this.category())),
    ),
  );
  text(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
}

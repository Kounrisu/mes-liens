import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { groupYoutube } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { LinkList } from '../shared/link-list';

/** Tous les liens YouTube, rangés par catégorie : formation, music, korean bands, korean learning, japanese learning, japanese bands. */
@Component({
  selector: 'app-youtube',
  imports: [LinkList, RouterLink],
  template: `
    <main class="page">
      <section aria-labelledby="yt-h">
        <h2 id="yt-h">
          YouTube <small class="meta">· {{ total() }} lien{{ total() > 1 ? 's' : '' }}</small>
        </h2>
        <div class="filters">
          <input
            type="search"
            placeholder="Rechercher dans YouTube…"
            aria-label="Rechercher dans YouTube"
            [value]="query()"
            (input)="query.set(val($event))"
          />
        </div>
        <ul class="tags" aria-label="Aller à une section">
          @for (s of grouped().sections; track s.category) {
            <li>
              <a class="badge cat" [href]="'#yt-' + slug(s.category)"
                >{{ s.category }} <small>{{ s.links.length }}</small></a
              >
            </li>
          }
          @if (grouped().others.length) {
            <li>
              <a class="badge" href="#yt-others"
                >autres <small>{{ grouped().others.length }}</small></a
              >
            </li>
          }
        </ul>
      </section>

      @for (s of grouped().sections; track s.category) {
        <section
          [attr.aria-labelledby]="'yt-h-' + slug(s.category)"
          [id]="'yt-' + slug(s.category)"
        >
          <h3 [id]="'yt-h-' + slug(s.category)">
            <a [routerLink]="['/category', s.category]">{{ s.category }}</a>
            <small class="meta">· {{ s.links.length }}</small>
          </h3>
          @if (s.links.length) {
            <app-link-list [links]="s.links" [filters]="false" />
          } @else {
            <p class="empty">
              Aucune vidéo pour l'instant. Enregistre un lien YouTube et choisis la catégorie «
              {{ s.category }} ».
            </p>
          }
        </section>
      }

      @if (grouped().others.length) {
        <section id="yt-others" aria-labelledby="yt-h-others">
          <h3 id="yt-h-others">
            Autres vidéos YouTube <small class="meta">· {{ grouped().others.length }}</small>
          </h3>
          <p class="meta">
            Non classées, ou dans une catégorie qui n'est pas listée ci-dessus. Modifie le lien pour
            choisir une catégorie.
          </p>
          <app-link-list [links]="grouped().others" [filters]="false" />
        </section>
      }
    </main>
  `,
})
export class YoutubePage {
  private readonly svc = inject(LinkService);

  protected readonly query = signal('');
  protected readonly grouped = computed(() =>
    groupYoutube(filterLinks(this.svc.activeLinks(), this.query(), [])),
  );
  protected readonly total = computed(
    () =>
      groupYoutube(this.svc.activeLinks()).sections.reduce((n, s) => n + s.links.length, 0) +
      groupYoutube(this.svc.activeLinks()).others.length,
  );

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected slug(s: string): string {
    return s.replace(/\s+/g, '-');
  }
}

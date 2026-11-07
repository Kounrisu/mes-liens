import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { groupYoutube } from '../core/catalog';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { LinkList } from '../shared/link-list';
import { youtubePlaylists } from '../core/youtube-playlists';

/** Tous les liens YouTube, rangés par catégorie : formation, music, korean bands, korean learning, japanese learning, japanese bands. */
@Component({
  selector: 'app-youtube',
  imports: [CategoryLabelPipe, TranslatePipe, LinkList, RouterLink],
  template: `
    <main class="page">
      <section aria-labelledby="yt-h">
        <h2 id="yt-h">
          YouTube
          <small class="meta"> {{ '· {0} lien{1}' | t: [total(), total() > 1 ? 's' : ''] }} </small>
        </h2>
        <div class="row view-choice">
          <button
            type="button"
            [attr.aria-pressed]="view() === 'categories'"
            (click)="view.set('categories')"
          >
            {{ 'Par catégorie' | t }}
          </button>
          <button
            type="button"
            [attr.aria-pressed]="view() === 'playlists'"
            (click)="view.set('playlists')"
          >
            {{ 'Mes playlists' | t }} · {{ playlists().length }}
          </button>
          <a class="btn" routerLink="/connections">{{ 'Importer mes favoris' | t }}</a>
        </div>
        <div class="filters">
          <input
            type="search"
            [placeholder]="'Rechercher dans YouTube…' | t"
            [attr.aria-label]="'Rechercher dans YouTube' | t"
            [value]="query()"
            (input)="query.set(val($event))"
          />
        </div>
        @if (view() === 'categories') {
          <ul class="tags" [attr.aria-label]="'Aller à une section' | t">
            @for (s of grouped().sections; track s.category) {
              <li>
                <a class="badge cat" [href]="'#yt-' + slug(s.category)"
                  >{{ s.category | categoryLabel }} <small>{{ s.links.length }}</small></a
                >
              </li>
            }
            @if (grouped().others.length) {
              <li>
                <a class="badge" href="#yt-others">
                  {{ 'autres' | t }} <small>{{ grouped().others.length }}</small></a
                >
              </li>
            }
          </ul>
        }
      </section>
      @if (view() === 'playlists') {
        <p class="meta">
          {{
            'Les vidéos enregistrées sont regroupées par playlist. Importe leur contenu depuis ton navigateur.'
              | t
          }}
        </p>
        @for (p of playlists(); track p.id) {
          <section class="card">
            <h3>
              <a [href]="p.url" target="_blank" rel="noopener noreferrer">{{ p.title }}</a>
              <small>{{ p.links.length }}</small>
            </h3>
            <app-link-list [links]="p.links" [filters]="false" />
          </section>
        } @empty {
          <p class="empty">
            {{
              'Aucune playlist enregistrée. Ajoute une adresse de playlist ou importe tes favoris.'
                | t
            }}
          </p>
        }
      } @else {
        @for (s of grouped().sections; track s.category) {
          <section
            [attr.aria-labelledby]="'yt-h-' + slug(s.category)"
            [id]="'yt-' + slug(s.category)"
          >
            <h3 [id]="'yt-h-' + slug(s.category)">
              <a [routerLink]="['/category', s.category]">{{ s.category | categoryLabel }}</a>
              <small class="meta">· {{ s.links.length }}</small>
            </h3>
            @if (s.links.length) {
              <app-link-list [links]="s.links" [filters]="false" />
            } @else {
              <p class="empty">
                {{
                  "Aucune vidéo pour l'instant. Enregistre un lien YouTube et choisis la catégorie « {0} »."
                    | t: [s.category]
                }}
              </p>
            }
          </section>
        }

        @if (grouped().others.length) {
          <section id="yt-others" aria-labelledby="yt-h-others">
            <h3 id="yt-h-others">
              {{ 'Autres vidéos YouTube' | t }}
              <small class="meta">· {{ grouped().others.length }}</small>
            </h3>
            <p class="meta">
              {{
                "Non classées, ou dans une catégorie qui n'est pas listée ci-dessus. Modifie le lien pour choisir une catégorie."
                  | t
              }}
            </p>
            <app-link-list [links]="grouped().others" [filters]="false" />
          </section>
        }
      }
    </main>
  `,
})
export class YoutubePage {
  private readonly svc = inject(LinkService);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  readonly view = signal('categories');
  constructor() {
    effect(() =>
      this.view.set(this.params()?.get('view') === 'playlists' ? 'playlists' : 'categories'),
    );
  }
  readonly playlists = computed(() =>
    youtubePlaylists(filterLinks(this.svc.activeLinks(), this.query(), [])),
  );

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

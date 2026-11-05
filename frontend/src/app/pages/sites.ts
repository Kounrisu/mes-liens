import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { childrenOf, sitesOf } from '../core/sites';

/** Les sites / plateformes enregistrés (Udemy, app.ultimatecourses.com, YouTube…) et les liens rattachés à chacun. */
@Component({
  selector: 'app-sites',
  imports: [CategoryLabelPipe, TranslatePipe, RouterLink],
  template: `
    <main class="page">
      <section aria-labelledby="sites-h">
        <h2 id="sites-h">
          {{ 'Sites' | t }} <small class="meta">· {{ cards().length }}</small>
        </h2>
        <p class="meta">
          {{
            "Un site est une plateforme (Udemy, app.ultimatecourses.com, YouTube…). Rattache-lui ensuite des liens précis vers ses formations. Pour en ajouter un, enregistre un lien depuis l'"
              | t
          }}
          <a routerLink="/"> {{ 'accueil' | t }} </a> {{ "en cochant « C'est un site »." | t }}
        </p>
        <div class="filters">
          <input
            type="search"
            [placeholder]="'Rechercher un site…' | t"
            [attr.aria-label]="'Rechercher un site' | t"
            [value]="query()"
            (input)="query.set(val($event))"
          />
        </div>

        @if (!svc.ready()) {
          <p>{{ 'Chargement…' | t }}</p>
        } @else if (cards().length === 0) {
          <p class="empty">
            {{
              (query() ? 'Aucun site ne correspond.' : 'Aucun site enregistré pour l’instant.') | t
            }}
          </p>
        }

        <ul class="grid">
          @for (c of cards(); track c.site.id) {
            <li class="card link">
              <div class="body">
                <h3>
                  <a [routerLink]="['/link', c.site.id]">{{ c.site.title }}</a>
                </h3>
                <p class="meta">
                  {{ c.site.domain }}
                  @if (c.site.category) {
                    ·
                    <a class="badge cat" [routerLink]="['/category', c.site.category]">{{
                      c.site.category | categoryLabel
                    }}</a>
                  }
                  {{ '· {0} lien{1}' | t: [c.children.length, c.children.length > 1 ? 's' : ''] }}
                </p>
                @if (c.children.length) {
                  <ul class="mini">
                    @for (l of c.children.slice(0, 5); track l.id) {
                      <li>
                        <a [routerLink]="['/link', l.id]">{{ l.title }}</a>
                      </li>
                    }
                  </ul>
                  @if (c.children.length > 5) {
                    <p class="meta">
                      {{
                        '… et {0} autre{1}'
                          | t: [c.children.length - 5, c.children.length - 5 > 1 ? 's' : '']
                      }}
                    </p>
                  }
                } @else {
                  <p class="empty">{{ 'Aucun lien rattaché.' | t }}</p>
                }
                <div class="row">
                  <a class="btn small" [routerLink]="['/link', c.site.id]">
                    {{ 'Ouvrir la fiche' | t }}
                  </a>
                  <a class="btn small" [routerLink]="['/']" [queryParams]="{ site: c.site.id }">
                    {{ '+ Ajouter un lien' | t }}
                  </a>
                  <a
                    class="btn small"
                    [href]="c.site.url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ 'Aller au site ↗' | t }}
                  </a>
                </div>
              </div>
            </li>
          }
        </ul>
      </section>
    </main>
  `,
})
export class SitesPage {
  protected readonly svc = inject(LinkService);
  protected readonly query = signal('');

  protected readonly cards = computed(() => {
    const all = this.svc.activeLinks();
    const sites = filterLinks(sitesOf(all), this.query(), []);
    return sites.map((site) => ({ site, children: childrenOf(all, site.id) }));
  });

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

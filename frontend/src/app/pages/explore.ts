import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { LinkService } from '../core/link.service';
import { filterLinks } from '../core/link-utils';
import { categoryWithin, libraryOf } from '../core/library';
import { categoryCounts } from '../core/catalog';
import { KnowledgeNode, nodeMatches, sourceOf } from '../core/knowledge-graph';
import { youtubePlaylists } from '../core/youtube-playlists';
import { KnowledgeMap } from '../shared/knowledge-map';
import { LinkList } from '../shared/link-list';
import { LinkRows } from '../shared/link-rows';
import { LinksTable } from '../shared/links-table';
import { FavoriteButton } from '../shared/favorite-button';
import { Link } from '../core/models';

@Component({
  imports: [
    RouterLink,
    CategoryLabelPipe,
    TranslatePipe,
    KnowledgeMap,
    LinkList,
    LinkRows,
    LinksTable,
    FavoriteButton,
  ],
  styleUrl: './explore.css',
  template: `<main class="explorer">
    <header class="explore-heading">
      <div>
        <p class="eyebrow">{{ 'ESPACE PERSONNEL' | t }}</p>
        <h2>{{ 'Votre bibliothèque, connectée.' | t }}</h2>
        <p class="intro">
          {{ 'Retrouvez vos liens. Explorez leurs connexions. Gardez le fil.' | t }}
        </p>
      </div>
      <a class="btn primary-link" routerLink="/">+ {{ 'Enregistrer un lien' | t }}</a>
    </header>
    <section class="saved-overview" [attr.aria-label]="'Mes enregistrements' | t">
      @for (s of saved(); track s.name) {
        <button
          type="button"
          class="saved-tile"
          [class.chosen]="source() === s.name"
          (click)="chooseSource(s.name)"
        >
          <span class="source-symbol" [attr.data-source]="s.name" aria-hidden="true">{{
            s.symbol
          }}</span>
          <span
            ><strong>{{ s.label | t }}</strong
            ><small>{{ 'Voir les liens enregistrés' | t }}</small></span
          ><b>{{ s.count }}</b>
        </button>
      }
      <a class="saved-tile" routerLink="/youtube" [queryParams]="{ view: 'playlists' }">
        <span class="source-symbol youtube" aria-hidden="true">▶</span
        ><span
          ><strong>{{ 'Playlists YouTube' | t }}</strong
          ><small>{{ 'Explorer les playlists et leurs vidéos' | t }}</small></span
        ><b>{{ playlistCount() }}</b>
      </a>
    </section>
    <div class="explore-layout">
      <aside class="explore-sidebar" [attr.aria-label]="'Filtrer la bibliothèque' | t">
        <div class="side-title">
          <h3>{{ 'Bibliothèque' | t }}</h3>
          <span>{{ all().length }}</span>
        </div>
        <button
          type="button"
          class="side-button"
          [class.chosen]="!onlyFavorites()"
          (click)="onlyFavorites.set(false); selected.set(null)"
        >
          {{ 'Tous les liens' | t }}<span>{{ all().length }}</span>
        </button>
        <button
          type="button"
          class="side-button"
          [class.chosen]="onlyFavorites()"
          (click)="onlyFavorites.set(true); selected.set(null)"
        >
          {{ '★ Favoris' | t }}<span>{{ favorites() }}</span>
        </button>
        <label class="side-label"
          >{{ 'Source' | t
          }}<select [value]="source()" (change)="source.set(value($event)); selected.set(null)">
            <option value="">{{ 'Toutes les sources' | t }}</option>
            @for (s of sources(); track s) {
              <option [value]="s">{{ s }}</option>
            }
          </select></label
        >
        <label class="side-label"
          >{{ 'Collection' | t
          }}<select
            [value]="collection()"
            (change)="collection.set(value($event)); selected.set(null)"
          >
            <option value="">{{ 'Toutes les collections' | t }}</option>
            @for (c of collections(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select></label
        >
        <div class="side-title">
          <h3>{{ 'Catégories' | t }}</h3>
          <button class="text-button" type="button" (click)="category.set(''); selected.set(null)">
            {{ 'Toutes' | t }}
          </button>
        </div>
        <div class="category-list">
          <button
            type="button"
            class="side-button"
            [class.chosen]="category() === '_'"
            (click)="chooseCategory('_')"
          >
            {{ 'non classé' | t }}<span>{{ uncategorized() }}</span>
          </button>
          @for (c of categories(); track c.category) {
            <button
              type="button"
              class="side-button"
              [class.child]="c.category.includes(' / ')"
              [class.chosen]="category() === c.category"
              (click)="chooseCategory(c.category)"
            >
              <span>{{ c.category | categoryLabel }}</span
              ><span>{{ c.count }}</span>
            </button>
          }
        </div>
        <a class="organize-link" routerLink="/library"
          >{{ 'Classer et organiser mes liens' | t }} →</a
        >
      </aside>
      <section class="explore-main">
        <div class="searchbar">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 5 5" /></svg
          ><input
            type="search"
            [value]="query()"
            (input)="query.set(value($event)); selected.set(null)"
            [placeholder]="'Rechercher un titre, un mot, une description…' | t"
            [attr.aria-label]="'Rechercher dans la bibliothèque' | t"
          />
        </div>
        <div class="results-toolbar">
          <p role="status">
            <strong>{{ filtered().length }}</strong> {{ 'liens' | t }}
            @if (category()) {
              <span>
                · {{ category() === '_' ? ('non classé' | t) : (category() | categoryLabel) }}</span
              >
            }
            @if (tag()) {
              <span> · #{{ tag() }}</span>
            }
          </p>
          <div class="view-switch" [attr.aria-label]="'Affichage' | t">
            <button type="button" [attr.aria-pressed]="view() === 'map'" (click)="view.set('map')">
              {{ 'Carte 3D' | t }}
            </button>
            <button
              type="button"
              [attr.aria-pressed]="view() === 'cards'"
              (click)="view.set('cards')"
            >
              {{ 'Cartes' | t }}
            </button>
            <button
              type="button"
              [attr.aria-pressed]="view() === 'list'"
              (click)="view.set('list')"
            >
              {{ 'Liste' | t }}
            </button>
            <button
              type="button"
              [attr.aria-pressed]="view() === 'table'"
              (click)="view.set('table')"
            >
              {{ 'Tableau' | t }}
            </button>
          </div>
          @if (hasFilters()) {
            <button class="text-button" type="button" (click)="reset()">
              {{ 'Effacer les filtres' | t }}
            </button>
          }
        </div>
        @if (!svc.ready()) {
          <p role="status">{{ 'Chargement de votre bibliothèque…' | t }}</p>
        } @else if (view() === 'map') {
          <div class="map-layout">
            <app-knowledge-map
              [links]="filtered()"
              [selected]="selected()?.id || ''"
              (pick)="selected.set($event)"
            />
            <aside class="inspector" [attr.aria-label]="'Détails de la sélection' | t">
              @if (selectedLink(); as link) {
                <div class="inspector-kicker">
                  <span>{{ sourceOf(link) || link.domain }}</span
                  ><app-favorite-button [link]="link" />
                </div>
                <h3>{{ link.title }}</h3>
                <p class="resource-domain">{{ link.domain }}</p>
                @if (lib(link).creator) {
                  <p class="creator">{{ lib(link).creator }}</p>
                }
                @if (lib(link).description) {
                  <p class="description">{{ lib(link).description }}</p>
                }
                @if (link.note) {
                  <p class="personal-note">{{ link.note }}</p>
                }
                @if (link.category) {
                  <button class="badge" type="button" (click)="chooseCategory(link.category)">
                    {{ link.category | categoryLabel }}
                  </button>
                }
                <div class="inspector-tags">
                  @for (t of link.tags; track t) {
                    <button type="button" class="badge" (click)="tag.set(t); selected.set(null)">
                      #{{ t }}
                    </button>
                  }
                </div>
                <div class="inspector-actions">
                  <a
                    class="btn primary-link"
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    >{{ 'Ouvrir le lien' | t }} ↗</a
                  ><a class="btn" [routerLink]="['/link', link.id, 'edit']">{{ 'Modifier' | t }}</a>
                </div>
                <a [routerLink]="['/link', link.id]">{{ 'Voir la fiche complète' | t }} →</a>
              } @else {
                <p class="eyebrow">{{ (selected() ? 'CONNEXIONS' : 'EXPLORER') | t }}</p>
                <h3>
                  {{
                    selected()
                      ? selected()!.kind === 'category'
                        ? (selected()!.label | categoryLabel)
                        : selected()!.label
                      : ('Choisissez un point de départ' | t)
                  }}
                </h3>
                <p class="meta">
                  {{
                    selected()
                      ? ('{0} liens reliés' | t: [related().length])
                      : ('Les grands points regroupent vos catégories, sources et mots-clés. Les petits points sont vos liens.'
                        | t)
                  }}
                </p>
                @if (selected()) {
                  <button class="primary" type="button" (click)="focusSelection()">
                    {{ 'Explorer ce groupe' | t }} →
                  </button>
                }
                <h4>{{ (selected() ? 'Liens reliés' : 'Liens récents') | t }}</h4>
                <div class="related-list">
                  @for (l of related().slice(0, 12); track l.id) {
                    <button type="button" class="related-item" (click)="selectLink(l)">
                      <span>{{ l.title }}</span
                      ><small>{{ sourceOf(l) || l.domain }}</small>
                    </button>
                  } @empty {
                    <p class="meta">{{ 'Aucun lien pour ces filtres.' | t }}</p>
                  }
                </div>
              }
            </aside>
          </div>
          <details class="accessible-nodes">
            <summary>{{ 'Explorer les mêmes liens en liste' | t }}</summary>
            <app-link-list [links]="filtered()" [filters]="false" />
          </details>
        } @else if (view() === 'cards') {
          <app-link-list [links]="filtered()" [filters]="false" />
        } @else if (view() === 'list') {
          <app-link-rows [links]="filtered()" [filters]="false" />
        } @else {
          <app-links-table [links]="filtered()" [searchable]="false" />
        }
      </section>
    </div>
  </main>`,
})
export class ExplorePage {
  readonly svc = inject(LinkService);
  readonly lib = libraryOf;
  readonly sourceOf = sourceOf;
  readonly all = computed(() => this.svc.activeLinks().filter((l) => l.kind !== 'site'));
  readonly query = signal('');
  readonly source = signal('');
  readonly category = signal('');
  readonly collection = signal('');
  readonly tag = signal('');
  readonly onlyFavorites = signal(false);
  readonly view = signal('map');
  readonly selected = signal<KnowledgeNode | null>(null);
  readonly favorites = computed(() => this.all().filter((l) => l.favorite).length);
  readonly categories = computed(() => {
    const counts = categoryCounts(this.all()).filter((c) => c.count > 0);
    const roots = counts.filter((c) => !c.category.includes(' / '));
    return roots.flatMap((root) => [
      root,
      ...counts
        .filter((c) => c.category.startsWith(root.category + ' / '))
        .sort((a, b) => a.category.localeCompare(b.category)),
    ]);
  });
  readonly uncategorized = computed(() => this.all().filter((l) => !l.category).length);
  readonly sources = computed(() =>
    [...new Set(this.all().map(sourceOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  );
  readonly collections = computed(() =>
    [...new Set(this.all().flatMap((l) => libraryOf(l).collections))].sort((a, b) =>
      a.localeCompare(b),
    ),
  );
  readonly playlistCount = computed(() => youtubePlaylists(this.all()).length);
  readonly saved = computed(() =>
    [
      { name: 'Facebook', label: 'Facebook enregistrés', symbol: 'f' },
      { name: 'Instagram', label: 'Instagram enregistrés', symbol: '◎' },
      { name: 'X', label: 'X enregistrés', symbol: '𝕏' },
    ].map((s) => ({
      ...s,
      count: this.all().filter((l) => sourceOf(l).toLowerCase() === s.name.toLowerCase()).length,
    })),
  );
  readonly filtered = computed(() =>
    filterLinks(this.all(), this.query(), this.tag() ? [this.tag()] : [])
      .filter(
        (l) =>
          (!this.source() || sourceOf(l).toLowerCase() === this.source().toLowerCase()) &&
          (!this.category() ||
            (this.category() === '_'
              ? !l.category
              : categoryWithin(l.category, this.category()))) &&
          (!this.collection() || libraryOf(l).collections.includes(this.collection())) &&
          (!this.onlyFavorites() || l.favorite),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
  readonly hasFilters = computed(
    () =>
      !!(
        this.query() ||
        this.source() ||
        this.category() ||
        this.collection() ||
        this.tag() ||
        this.onlyFavorites()
      ),
  );
  readonly selectedLink = computed(() =>
    this.selected()?.kind === 'link'
      ? this.filtered().find((l) => l.id === this.selected()!.value)
      : undefined,
  );
  readonly related = computed(() =>
    this.selected()
      ? this.filtered().filter((l) => nodeMatches(l, this.selected()!))
      : this.filtered(),
  );
  value(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  chooseSource(name: string) {
    this.reset();
    this.source.set(name);
    this.view.set('cards');
  }
  chooseCategory(name: string) {
    this.category.set(name);
    this.selected.set(null);
  }
  selectLink(l: Link) {
    this.selected.set({
      id: 'link:' + l.id,
      kind: 'link',
      value: l.id,
      label: l.title,
      count: 1,
      x: 0,
      y: 0,
      z: 0,
    });
  }
  reset() {
    this.query.set('');
    this.source.set('');
    this.category.set('');
    this.collection.set('');
    this.tag.set('');
    this.onlyFavorites.set(false);
    this.selected.set(null);
  }
  focusSelection() {
    const node = this.selected();
    if (!node) return;
    if (node.kind === 'category') this.category.set(node.value);
    if (node.kind === 'source') this.source.set(node.value);
    if (node.kind === 'tag') this.tag.set(node.value);
    this.selected.set(null);
  }
}

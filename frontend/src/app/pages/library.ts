import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import {
  libraryOf,
  categoryPaths,
  categoryWithin,
  duplicateKey,
  LEARNING_STATES,
} from '../core/library';
import { LinksTable } from '../shared/links-table';
import { LinkList } from '../shared/link-list';
import { tagCounts } from '../core/link-utils';
import { InsightsService } from '../core/insights.service';

@Component({
  selector: 'app-library',
  imports: [LinksTable, LinkList, RouterLink],
  template: ` <main class="page">
    <section class="library-heading">
      <div>
        <h2>Ma bibliothèque</h2>
        <p class="meta">
          Classer mes découvertes, avancer dans mes formations, retrouver mes connaissances.
        </p>
      </div>
      <a class="btn" routerLink="/">Enregistrer un lien</a>
    </section>
    <nav class="library-tabs" aria-label="Vues de la bibliothèque">
      @for (v of views; track v.id) {
        <button
          type="button"
          [class.primary]="view() === v.id"
          [attr.aria-pressed]="view() === v.id"
          (click)="view.set(v.id)"
        >
          {{ v.label }} <small>{{ count(v.id) }}</small>
        </button>
      }
    </nav>
    <section class="card">
      <div class="cols">
        <label
          >Catégorie et sous-catégories<select
            [value]="category()"
            (change)="category.set(text($event))"
          >
            <option value="">Toutes les catégories</option>
            @for (c of categories(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select></label
        >
        <label
          >Collection<select [value]="collection()" (change)="collection.set(text($event))">
            <option value="">Toutes les collections</option>
            @for (c of collections(); track c) {
              <option [value]="c">{{ c }}</option>
            }
          </select></label
        >
        <label
          >Progression<select [value]="status()" (change)="status.set(text($event))">
            <option value="">Toutes les progressions</option>
            @for (s of states; track s.key) {
              <option [value]="s.key">{{ s.label }}</option>
            }
          </select></label
        >
      </div>
      <div class="row view-choice">
        <button type="button" [attr.aria-pressed]="!cards()" (click)="cards.set(false)">
          Tableau et classement en lot</button
        ><button type="button" [attr.aria-pressed]="cards()" (click)="cards.set(true)">
          Aperçus visuels
        </button>
      </div>
      @if (view() === 'inbox') {
        <p class="meta">
          Une catégorie suggérée ne signifie pas que le lien a été trié. Vérifie le classement, puis
          marque-le comme trié.
        </p>
      }
      @if (view() === 'duplicates') {
        <p class="meta">
          Adresses identiques, hors paramètres de suivi courants. Rien n'est fusionné ni supprimé
          automatiquement.
        </p>
      }
      @if (cards()) {
        <app-link-list [links]="filtered()" />
      } @else {
        <app-links-table [links]="filtered()" />
      }
    </section>
    @if (view() === 'knowledge') {
      <section aria-label="Mes notes de connaissances">
        <h2>Ce que je retiens</h2>
        <div class="knowledge-grid">
          @for (l of filtered(); track l.id) {
            <article class="card">
              <h3>
                <a [routerLink]="['/link', l.id]">{{ l.title }}</a>
              </h3>
              <p class="note">{{ lib(l).learned }}</p>
              @if (lib(l).applyTo) {
                <p class="note"><strong>Application :</strong> {{ lib(l).applyTo }}</p>
              }
              <p class="meta">{{ lib(l).collections.join(' · ') }}</p>
            </article>
          }
        </div>
      </section>
    }
    <details class="card">
      <summary>Gérer les catégories et étiquettes</summary>
      <p>
        Renomme ou fusionne un nom dans toute la bibliothèque. Les sous-catégories suivent leur
        parent.
      </p>
      <form (submit)="rename($event)">
        <div class="cols">
          <label
            >À modifier<select
              [value]="renameKind()"
              (change)="
                renameKind.set(text($event) === 'tag' ? 'tag' : 'category'); renameFrom.set('')
              "
            >
              <option value="category">Catégorie</option>
              <option value="tag">Étiquette</option>
            </select></label
          >
          <label
            >Nom actuel<select
              required
              [value]="renameFrom()"
              (change)="renameFrom.set(text($event))"
            >
              <option value="">Choisir…</option>
              @for (n of renameNames(); track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select></label
          >
          <label
            >Nouveau nom ou nom existant<input
              type="text"
              required
              [value]="renameTo()"
              (input)="renameTo.set(text($event))"
          /></label>
        </div>
        <button class="primary" [disabled]="busy()">Renommer / fusionner</button>
        <p role="status">{{ message() }}</p>
      </form>
    </details>
  </main>`,
})
export class LibraryPage {
  readonly svc = inject(LinkService);
  readonly insights = inject(InsightsService);
  readonly lib = libraryOf;
  readonly views = [
    { id: 'inbox', label: 'À trier' },
    { id: 'all', label: 'Tous les liens' },
    { id: 'active', label: 'En cours' },
    { id: 'review', label: 'À revoir' },
    { id: 'knowledge', label: 'Connaissances' },
    { id: 'duplicates', label: 'Doublons' },
    { id: 'attention', label: 'À vérifier' },
    { id: 'archive', label: 'Archives' },
  ];
  readonly states = Object.entries(LEARNING_STATES).map(([key, label]) => ({ key, label }));
  readonly view = signal('inbox');
  readonly category = signal('');
  readonly collection = signal('');
  readonly status = signal('');
  readonly cards = signal(false);
  readonly categories = computed(() => categoryPaths(this.svc.links()));
  readonly collections = computed(() =>
    [...new Set(this.svc.links().flatMap((l) => libraryOf(l).collections))].sort(),
  );
  readonly duplicateIds = computed(() => {
    const groups = new Map<string, string[]>();
    for (const l of this.svc.links()) {
      const k = duplicateKey(l.url);
      groups.set(k, [...(groups.get(k) ?? []), l.id]);
    }
    return new Set([...groups.values()].filter((a) => a.length > 1).flat());
  });
  subset(view: string) {
    const today = new Date().toLocaleDateString('sv-SE');
    return this.svc.links().filter((l) => {
      const b = libraryOf(l);
      if (view === 'archive') return b.archived;
      if (b.archived) return false;
      const i = this.insights.records()[l.id];
      return view === 'inbox'
        ? !b.reviewed
        : view === 'active'
          ? b.learningStatus === 'active'
          : view === 'review'
            ? !!b.reviewOn && b.reviewOn <= today
            : view === 'knowledge'
              ? !!b.learned.trim()
              : view === 'duplicates'
                ? this.duplicateIds().has(l.id)
                : view === 'attention'
                  ? !i || i.url !== l.url || !['working', 'redirected'].includes(i.status)
                  : true;
    });
  }
  count(view: string) {
    return this.subset(view).length;
  }
  readonly filtered = computed(() =>
    this.subset(this.view()).filter(
      (l) =>
        (!this.category() || categoryWithin(l.category, this.category())) &&
        (!this.collection() || libraryOf(l).collections.includes(this.collection())) &&
        (!this.status() || libraryOf(l).learningStatus === this.status()),
    ),
  );
  readonly renameKind = signal<'category' | 'tag'>('category');
  readonly renameFrom = signal('');
  readonly renameTo = signal('');
  readonly busy = signal(false);
  readonly message = signal('');
  readonly renameNames = computed(() =>
    this.renameKind() === 'category'
      ? this.categories()
      : tagCounts(this.svc.links()).map((t) => t.tag),
  );
  text(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  async rename(e: Event) {
    e.preventDefault();
    if (!confirm('Renommer / fusionner ce nom dans toute la bibliothèque ?')) return;
    this.busy.set(true);
    try {
      const n = await this.svc.renameClassification(
        this.renameKind(),
        this.renameFrom(),
        this.renameTo(),
      );
      this.message.set(`${n} lien(s) mis à jour.`);
      this.renameFrom.set('');
      this.renameTo.set('');
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : 'Modification impossible.');
    } finally {
      this.busy.set(false);
    }
  }
}

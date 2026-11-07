import { Component, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslatePipe, CategoryLabelPipe } from '../core/i18n';
import { LinkService } from '../core/link.service';
import { buildSavedCollector } from '../core/saved-collector';
import { SavedItem, readSavedItems, planSavedImport } from '../core/saved-import';
import { categorySuggestions } from '../core/catalog';

@Component({
  imports: [TranslatePipe, CategoryLabelPipe, RouterLink],
  template: `<main class="page">
    <section>
      <h2>{{ 'Importer depuis mes comptes' | t }}</h2>
      <p>
        {{
          'Depuis ce portable, utilise tes sessions déjà ouvertes sur YouTube, X, Facebook et Instagram.'
            | t
        }}
      </p>
      <p class="meta">
        {{
          'Aucun mot de passe à fournir. La collecte reste dans le navigateur jusqu’à l’import dans mes-liens.'
            | t
        }}
      </p>
    </section>
    <section class="card">
      <h3>{{ '1. Installer le favori de collecte' | t }}</h3>
      <p>
        {{
          'Glisse ce bouton dans la barre de favoris du navigateur, puis ouvre tes éléments enregistrés.'
            | t
        }}
      </p>
      <a class="btn primary-link" [href]="collectorHref" (click)="$event.preventDefault()">{{
        'Collecter pour mes-liens' | t
      }}</a>
      <button type="button" (click)="copy()">{{ 'Copier le code du favori' | t }}</button>
      <p class="meta">
        {{ 'Si le site bloque le favori, enregistre les liens individuellement.' | t }}
      </p>
    </section>
    <section class="card">
      <h3>{{ '2. Ouvrir et collecter mes éléments' | t }}</h3>
      <div class="row">
        <a
          class="btn"
          href="https://www.youtube.com/feed/playlists"
          target="_blank"
          rel="noopener noreferrer"
          >YouTube</a
        >
        <a class="btn" href="https://x.com/i/bookmarks" target="_blank" rel="noopener noreferrer"
          >X</a
        >
        <a
          class="btn"
          href="https://www.facebook.com/saved/"
          target="_blank"
          rel="noopener noreferrer"
          >Facebook</a
        >
        <a class="btn" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer"
          >Instagram</a
        >
      </div>
      <p>
        {{
          'Sur Instagram, ouvre ton profil puis Enregistrements. Sur YouTube, collecte d’abord la liste des playlists, puis ouvre chaque playlist pour collecter ses vidéos.'
            | t
        }}
      </p>
      <p>
        {{
          'Clique sur le favori, fais défiler la page, puis choisis Exporter les liens. Le compteur indique les éléments chargés, pas le total du compte.'
            | t
        }}
      </p>
      <p class="notice">
        {{
          'La capture peut être partielle. Répète la collecte pour les autres playlists ou collections ; les doublons seront reconnus.'
            | t
        }}
      </p>
    </section>
    <section class="card">
      <h3>{{ '3. Examiner et importer' | t }}</h3>
      <details>
        <summary>{{ 'Coller une collecte JSON' | t }}</summary>
        <label>{{ 'Liens collectés au format JSON' | t }}<textarea rows="5" [value]="pasted()" (input)="pasted.set($any($event.target).value)" [disabled]="busy()" maxlength="10000000"></textarea></label>
        <button type="button" [disabled]="busy() || !svc.ready() || !pasted().trim()" (click)="loadPasted()">{{ 'Examiner les liens collés' | t }}</button>
      </details>
      <label
        >{{ 'Fichier de liens collectés (.json)' | t
        }}<input
          type="file"
          accept=".json,application/json"
          [disabled]="busy() || !svc.ready()"
          (change)="load($event)"
      /></label>
      <label
        >{{ 'Catégorie des nouveaux liens' | t }}
        <input
          type="text"
          list="import-categories"
          [value]="category()"
          [disabled]="busy()"
          (input)="changeCategory($event)"
          [placeholder]="'Détection automatique ou à trier' | t"
          maxlength="200"
        />
        <datalist id="import-categories">
          @for (c of categories(); track c) {
            <option [value]="c"></option>
          }
        </datalist>
      </label>
      @if (items().length && !result()) {
        <button type="button" [disabled]="busy()" (click)="analyze()">
          {{ 'Analyser les liens' | t }}
        </button>
      }
      @if (result(); as r) {
        <p role="status">
          {{
            '{0} nouveaux · {1} enrichis · {2} inchangés'
              | t: [r.plan.created.length, r.plan.updated.length, r.plan.unchanged]
          }}
        </p>
        <p class="meta">
          {{
            'Les notes, titres et classements existants sont conservés. Les descriptions manquantes et appartenances aux playlists sont complétées.'
              | t
          }}
        </p>
        @if (r.skippedDeleted) {
          <p>{{ '{0} lien(s) précédemment supprimé(s) ignoré(s).' | t: [r.skippedDeleted] }}</p>
        }
        @if (r.plan.errors.length) {
          <ul class="error" role="alert">
            @for (e of r.plan.errors; track $index) {
              <li>{{ e }}</li>
            }
          </ul>
        }
        <ul class="rows classification-preview">
          @for (row of r.plan.created.concat(r.plan.updated); track row.link.id) {
            <li class="rowitem">
              <span>{{ row.link.title }}</span
              ><span class="badge cat">{{ row.link.category | categoryLabel }}</span>
            </li>
          }
        </ul>
        <button
          type="button"
          class="primary"
          [disabled]="
            busy() || r.plan.errors.length > 0 || !(r.plan.created.length + r.plan.updated.length)
          "
          (click)="apply()"
        >
          {{ (busy() ? 'Enregistrement…' : 'Importer dans ma bibliothèque') | t }}
        </button>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() | t }}</p>
      }
      @if (message()) {
        <p role="status">{{ message() | t }}</p>
      }
    </section>
    <a routerLink="/library">{{ 'Ma bibliothèque' | t }}</a>
  </main>`,
})
export class ConnectionsPage {
  readonly svc = inject(LinkService);
  private readonly code = buildSavedCollector();
  readonly collectorHref = inject(DomSanitizer).bypassSecurityTrustUrl(this.code);
  readonly items = signal<SavedItem[]>([]);
  readonly pasted = signal('');
  readonly category = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly result = signal<Awaited<ReturnType<typeof planSavedImport>> | null>(null);
  categories() {
    return categorySuggestions(this.svc.links());
  }
  async copy() {
    try {
      await navigator.clipboard.writeText(this.code);
      this.message.set('Code copié. Colle-le dans l’adresse d’un nouveau favori.');
    } catch {
      this.error.set('Copie impossible. Glisse le bouton dans la barre de favoris.');
    }
  }
  changeCategory(e: Event) {
    this.category.set((e.target as HTMLInputElement).value);
    this.result.set(null);
  }
  async loadPasted() {
    this.result.set(null);
    this.items.set([]);
    this.error.set('');
    this.message.set('');
    this.busy.set(true);
    try {
      this.items.set(readSavedItems(this.pasted()));
      this.result.set(await planSavedImport(this.svc.storage, this.items(), this.category()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Import impossible.');
    } finally {
      this.busy.set(false);
    }
  }
  async load(e: Event) {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = '';
    this.result.set(null);
    this.items.set([]);
    this.error.set('');
    this.message.set('');
    if (!file) return;
    this.busy.set(true);
    try {
      if (file.size > 10_000_000) throw new Error('Fichier trop volumineux (10 Mo maximum).');
      this.items.set(readSavedItems(await file.text()));
      this.result.set(await planSavedImport(this.svc.storage, this.items(), this.category()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Import impossible.');
    } finally {
      this.busy.set(false);
    }
  }
  async analyze() {
    this.busy.set(true);
    this.error.set('');
    try {
      this.result.set(await planSavedImport(this.svc.storage, this.items(), this.category()));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Import impossible.');
    } finally {
      this.busy.set(false);
    }
  }
  async apply() {
    const result = this.result();
    if (!result || this.busy() || result.plan.errors.length) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.svc.applyZip(result.plan, { deleteMissing: false });
      this.result.set(null);
      this.items.set([]);
      this.pasted.set('');
      this.message.set('Import terminé. Les liens sont disponibles dans la bibliothèque.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Import impossible.');
      this.result.set(null);
    } finally {
      this.busy.set(false);
    }
  }
}

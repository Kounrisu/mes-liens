import { I18nService, TranslatePipe } from '../core/i18n';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { SourceEntry, sourcesOf } from '../core/sources';

@Component({
  selector: 'app-sources',
  imports: [TranslatePipe, RouterLink],
  template: `
    <main class="page">
      <section class="library-heading">
        <div>
          <h2>{{ 'Sources et sites' | t }}</h2>
          <p class="meta">{{ 'La liste utilisée dans « Source / site de rattachement ».' | t }}</p>
        </div>
        <button type="button" class="primary" (click)="edit(null)">
          {{ 'Ajouter une source' | t }}
        </button>
      </section>
      @if (editing()) {
        <form class="card" (submit)="save($event)">
          <h3>{{ (original() ? 'Modifier la source' : 'Ajouter une source') | t }}</h3>
          <fieldset [disabled]="busy()" class="source-fields">
            <label>
              {{ 'Nom de la source' | t }}
              <input
                type="text"
                required
                maxlength="100"
                [value]="name()"
                (input)="name.set(text($event))"
            /></label>
            @if (needsUrl()) {
              <label>
                {{ 'Adresse du site' | t }}
                <input
                  type="text"
                  inputmode="url"
                  required
                  [placeholder]="'https://…' | t"
                  [value]="url()"
                  (input)="url.set(text($event))"
              /></label>
            }
            @if (original()) {
              <p class="meta">
                {{
                  'Le nouveau nom sera appliqué aux liens utilisant cette source, y compris les archives.'
                    | t
                }}
              </p>
            }
            <div class="row">
              <button class="primary" type="submit">{{ 'Enregistrer' | t }}</button
              ><button type="button" (click)="editing.set(false)">{{ 'Annuler' | t }}</button>
            </div>
          </fieldset>
        </form>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() | t }}</p>
      }
      @if (message()) {
        <p role="status">{{ message() | t }}</p>
      }
      <section class="card">
        <div class="row">
          <a class="btn" [routerLink]="['/sources', 'YouTube']">YouTube</a>
          <a class="btn" [routerLink]="['/sources', 'Master.dev']">Master.dev</a>
          <a class="btn" routerLink="/connections">{{ 'Importer mes favoris' | t }}</a>
        </div>
        <div class="filters">
          <input
            type="search"
            [attr.aria-label]="'Rechercher une source' | t"
            [placeholder]="'Rechercher une source…' | t"
            [value]="query()"
            (input)="query.set(text($event))"
          />
        </div>
        <p class="meta">{{ '{0} source(s)' | t: [entries().length] }}</p>
        <ul class="rows">
          @for (s of entries(); track s.key) {
            <li class="rowitem">
              <strong
                ><a [routerLink]="['/sources', s.name]">{{ s.name }}</a></strong
              ><span class="meta"> {{ '{0} lien(s)' | t: [s.links.length] }} </span>
              @if (s.sites.length) {
                <span class="meta">{{ s.sites[0].domain }}</span>
              }
              <span class="spacer"></span>
              <button
                type="button"
                [disabled]="busy()"
                [attr.aria-label]="'Modifier la source : ' + s.name | t"
                (click)="edit(s)"
              >
                {{ 'Modifier' | t }}
              </button>
              <button
                type="button"
                class="danger"
                [disabled]="busy()"
                [attr.aria-label]="'Supprimer la source : ' + s.name | t"
                (click)="remove(s)"
              >
                {{ 'Supprimer' | t }}
              </button>
            </li>
          } @empty {
            <li class="empty">{{ 'Aucune source ne correspond.' | t }}</li>
          }
        </ul>
        <a routerLink="/sites"> {{ 'Voir les sites et leurs liens rattachés' | t }} </a>
      </section>
    </main>
  `,
})
export class SourcesPage {
  protected readonly i18n = inject(I18nService);
  readonly svc = inject(LinkService);
  readonly query = signal('');
  readonly entries = computed(() =>
    sourcesOf(this.svc.links()).filter((s) =>
      s.name.toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase()),
    ),
  );
  readonly editing = signal(false);
  readonly original = signal<string | null>(null);
  readonly name = signal('');
  readonly url = signal('');
  readonly needsUrl = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  text(e: Event) {
    return (e.target as HTMLInputElement).value;
  }
  edit(source: SourceEntry | null) {
    this.original.set(source?.key ?? null);
    this.name.set(source?.name ?? '');
    this.url.set(source?.sites[0]?.url ?? '');
    this.needsUrl.set(!source || !!source.sites.length);
    this.error.set('');
    this.message.set('');
    this.editing.set(true);
  }
  async save(e: Event) {
    e.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.svc.saveSource(this.original(), this.name(), this.url());
      this.editing.set(false);
      this.message.set('Source enregistrée.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Modification impossible.');
    } finally {
      this.busy.set(false);
    }
  }
  async remove(source: SourceEntry) {
    if (
      this.busy() ||
      !confirm(
        this.i18n.t(
          `Supprimer la source « ${source.name} » ? Ses ${source.links.length} liens seront conservés, sans ce rattachement. La fiche du site sera supprimée.`,
        ),
      )
    )
      return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.svc.removeSource(source.key);
      if (this.original() === source.key) this.editing.set(false);
      this.message.set('Source supprimée. Les liens ont été conservés.');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Modification impossible.');
    } finally {
      this.busy.set(false);
    }
  }
}

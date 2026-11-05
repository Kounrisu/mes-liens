import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { buildBookmarklet, shortcutBase } from '../core/bookmarklet';
import { ImportError } from '../core/backup';
import { downloadFile, today } from '../core/download';
import { LinkService } from '../core/link.service';
import { SyncService } from '../core/sync.service';
import { suggestedServerUrl } from '../core/sync-api';
import { ZipImportPlan } from '../core/zip-backup';

/** Administration : exports (favoris HTML, archive ZIP pour l'IA), import d'une archive ZIP mise à jour, et réglages techniques. */
@Component({
  selector: 'app-admin',
  imports: [DatePipe],
  template: `
    <main class="page">
      <h2>Administration</h2>

      <section class="card" aria-labelledby="adm-html">
        <h3 id="adm-html">Exporter mes favoris (HTML)</h3>
        <p class="meta">
          Un fichier de favoris que Chrome, Edge, Firefox et Safari savent importer. Un dossier par
          catégorie, avec les étiquettes et les notes.
        </p>
        <button type="button" class="primary" (click)="exportHtml()">
          Télécharger les favoris (.html)
        </button>
      </section>

      <section class="card" aria-labelledby="adm-zip">
        <h3 id="adm-zip">Exporter une archive pour l'IA (ZIP avec images)</h3>
        <p class="meta">
          Contient <code>links.json</code> (tous les liens, modifiables), les captures d'écran et un
          <code>LISEZ-MOI.md</code> qui explique les règles à l'IA. Donne le ZIP à une IA,
          demande-lui de le modifier, puis réimporte-le ci-dessous.
        </p>
        <button type="button" class="primary" [disabled]="busy()" (click)="exportZip()">
          Télécharger l'archive (.zip)
        </button>
      </section>

      <section class="card" aria-labelledby="adm-imp">
        <h3 id="adm-imp">Importer une archive ZIP mise à jour</h3>
        <p class="meta">
          Le fichier est d'abord <strong>analysé</strong> : tu vois ce qui sera créé, modifié ou
          supprimé avant que quoi que ce soit soit écrit. Une seule erreur dans l'archive annule
          tout l'import.
        </p>
        <label class="ghost btn"
          >Choisir un fichier ZIP…
          <input type="file" accept=".zip,application/zip" hidden (change)="pick($event)" />
        </label>
        @if (analysing()) {
          <p class="meta" role="status">Analyse en cours…</p>
        }
        @if (importError()) {
          <p class="error" role="alert">{{ importError() }}</p>
        }

        @if (plan(); as p) {
          <div class="plan" role="region" aria-label="Résumé de l'import">
            <p>
              <strong>{{ fileName() }}</strong>
            </p>
            @if (p.warnings.length) {
              <aside class="notice">
                <strong>{{ p.warnings.length }} doublon(s) possible(s)</strong>
                <ul>
                  @for (w of p.warnings.slice(0, 10); track $index) {
                    <li>{{ w }}</li>
                  }
                </ul>
              </aside>
            }
            @if (!p.errors.length) {
              <ul>
                <li>{{ p.created.length }} lien{{ p.created.length > 1 ? 's' : '' }} à créer</li>
                <li>{{ p.updated.length }} lien{{ p.updated.length > 1 ? 's' : '' }} à modifier</li>
                <li>
                  {{ p.deleted.length }} lien{{ p.deleted.length > 1 ? 's' : '' }} à supprimer
                  (marqués <code>deleted</code>)
                </li>
                <li>{{ p.unchanged }} inchangé{{ p.unchanged > 1 ? 's' : '' }}</li>
              </ul>
            }
            @if (p.errors.length) {
              <p class="error" role="alert">
                {{ p.errors.length }} erreur{{ p.errors.length > 1 ? 's' : '' }} : l'import est
                impossible tant que l'archive n'est pas corrigée.
              </p>
              <ul class="errors">
                @for (e of p.errors.slice(0, 20); track $index) {
                  <li>{{ e }}</li>
                }
              </ul>
              @if (p.errors.length > 20) {
                <p class="meta">… et {{ p.errors.length - 20 }} autres.</p>
              }
            } @else {
              @if (changed().length) {
                <details>
                  <summary>
                    Détail des {{ changed().length }} changement{{
                      changed().length > 1 ? 's' : ''
                    }}
                  </summary>
                  <ul class="changes">
                    @for (c of changed().slice(0, 100); track c.link.id) {
                      <li>
                        <strong>{{ c.link.title }}</strong> — {{ c.fields.join(', ') }}
                      </li>
                    }
                  </ul>
                  @if (changed().length > 100) {
                    <p class="meta">… et {{ changed().length - 100 }} autres.</p>
                  }
                </details>
              }
              @if (p.missing.length) {
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="deleteMissing()"
                    (change)="deleteMissing.set(!deleteMissing())"
                  />
                  Supprimer aussi les {{ p.missing.length }} lien{{
                    p.missing.length > 1 ? 's' : ''
                  }}
                  absent{{ p.missing.length > 1 ? 's' : '' }} de l'archive
                  <small class="meta">(sinon ils sont conservés)</small>
                </label>
              }
              <div class="row">
                <button
                  type="button"
                  class="primary"
                  [disabled]="busy() || nothingToDo()"
                  (click)="apply()"
                >
                  Appliquer l'import
                </button>
                <button type="button" class="ghost" (click)="cancel()">Annuler</button>
              </div>
              @if (nothingToDo()) {
                <p class="meta">Rien à changer : l'archive est identique à tes liens actuels.</p>
              }
            }
          </div>
        }
        @if (done()) {
          <p class="meta" role="status">{{ done() }}</p>
        }
      </section>

      <section class="card" aria-labelledby="adm-add">
        <h3 id="adm-add">Ajouter un lien depuis un autre site</h3>
        <p class="meta">
          <strong>Sur ordinateur :</strong> glisse ce bouton dans ta barre de favoris. Sur n'importe
          quelle page, clique dessus : mes-liens s'ouvre avec l'adresse et le titre déjà remplis.
        </p>
        <div class="row">
          <a
            class="btn primary-link"
            [href]="bookmarkletHref"
            (click)="$event.preventDefault()"
            draggable="true"
            >+ mes-liens</a
          >
          <button type="button" (click)="copyBookmarklet()">Copier le code du favori</button>
        </div>
        <p class="meta">
          Certains sites très stricts bloquent ce type de favori ; dans ce cas, copie l'adresse et
          colle-la dans le formulaire de l'accueil.
        </p>
        <p class="meta">
          <strong>Sur iPhone / iPad :</strong> iOS n'envoie pas les pages vers une application
          installée. Il faut un <em>Raccourci</em> (non testé sur iOS, les noms exacts des actions
          peuvent varier) :
        </p>
        <ol class="meta">
          <li>
            App Raccourcis → « + » → nomme-le « Ajouter à mes-liens ». Dans ses réglages, active «
            Afficher dans la feuille de partage » et limite-le aux <em>URL</em> / pages Safari.
          </li>
          <li>
            Action « Encoder l'URL » (ou « Encoder » du texte) appliquée à l'<em
              >Entrée du raccourci</em
            >.
          </li>
          <li>
            Action « Texte » contenant <code>{{ shortcutPrefix }}</code> suivi du résultat encodé.
          </li>
          <li>Action « Ouvrir les URL » appliquée à ce texte.</li>
        </ol>
        <p class="meta">
          Ensuite : dans Safari, Partager → « Ajouter à mes-liens ». La page s'ouvre dans Safari, le
          lien est enregistré sur le serveur et apparaît dans l'app installée à sa prochaine mise à
          jour.
        </p>
      </section>

      <details class="card">
        <summary>Technique : sauvegarde JSON complète et connexion au serveur</summary>
        <h3>Sauvegarde JSON complète</h3>
        <p class="meta">
          Tous les liens, y compris l'historique et les liens supprimés (hors captures). Sert à
          restaurer exactement un état.
        </p>
        <div class="row">
          <button type="button" (click)="exportJson()">Exporter (.json)</button>
          <label class="ghost btn"
            >Importer (.json)
            <input
              type="file"
              accept="application/json,.json"
              hidden
              (change)="importJson($event)"
            />
          </label>
        </div>

        <h3>Connexion au serveur</h3>
        <p class="meta">
          Tes liens sont enregistrés sur ton serveur ; l'application les y envoie et les y reprend
          toute seule, sans rien à faire. État : <strong>{{ statusLabel() }}</strong>
          @if (sync.lastSyncAt()) {
            · dernière mise à jour {{ sync.lastSyncAt() | date: 'dd/MM/yyyy HH:mm:ss' }}
          }
        </p>
        @if (sync.message()) {
          <p class="meta" role="status">{{ sync.message() }}</p>
        }
        @if (sync.gateway()) {
          <p class="meta">Connecté automatiquement par le serveur : aucun jeton à saisir.</p>
        } @else {
          <form (submit)="connect($event)">
            <label
              >URL du serveur
              <input
                type="text"
                inputmode="url"
                autocomplete="off"
                placeholder="https://liens.example.com"
                [value]="cfgUrl()"
                (input)="cfgUrl.set(val($event))"
              />
            </label>
            <label
              >Jeton <small>(32 caractères minimum, stocké uniquement sur cet appareil)</small>
              <input
                type="password"
                autocomplete="off"
                [value]="cfgToken()"
                (input)="cfgToken.set(val($event))"
              />
            </label>
            @if (cfgError()) {
              <p class="error" role="alert">{{ cfgError() }}</p>
            }
            <button type="submit" class="primary">Enregistrer et se connecter</button>
          </form>
        }
        @if (sync.status() !== 'unconfigured') {
          <div class="row">
            <button type="button" (click)="sync.syncNow()">Mettre à jour maintenant</button>
            @if (!sync.gateway()) {
              <button type="button" class="ghost danger" (click)="disconnect()">Déconnecter</button>
            }
          </div>
        }
      </details>

      @if (info()) {
        <p class="toast" role="status">{{ info() }}</p>
      }
    </main>
  `,
})
export class AdminPage {
  protected readonly svc = inject(LinkService);
  protected readonly sync = inject(SyncService);

  protected readonly busy = signal(false);
  protected readonly analysing = signal(false);
  protected readonly plan = signal<ZipImportPlan | null>(null);
  protected readonly fileName = signal('');
  protected readonly importError = signal('');
  protected readonly deleteMissing = signal(false);
  protected readonly done = signal('');
  protected readonly info = signal('');

  protected readonly cfgUrl = signal(this.sync.serverUrl() || suggestedServerUrl(window.location));
  protected readonly cfgToken = signal('');
  protected readonly cfgError = signal('');

  protected readonly changed = computed(() => {
    const p = this.plan();
    return p ? [...p.created, ...p.updated] : [];
  });
  protected readonly nothingToDo = computed(() => {
    const p = this.plan();
    return (
      !p ||
      (p.created.length + p.updated.length + p.deleted.length === 0 &&
        !(this.deleteMissing() && p.missing.length))
    );
  });

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly shortcutPrefix = shortcutBase(window.location.origin);
  private readonly bookmarklet = buildBookmarklet(window.location.origin);
  /** Contenu 100 % généré par l'application (origine de la page + code fixe) : jamais de texte venant de l'extérieur. */
  protected readonly bookmarkletHref: SafeUrl = this.sanitizer.bypassSecurityTrustUrl(
    this.bookmarklet,
  );

  protected async copyBookmarklet(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.bookmarklet);
      this.flash('Code copié : crée un favori et colle-le dans le champ adresse (URL).');
    } catch {
      this.flash('Copie impossible sur cet appareil.');
    }
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected statusLabel(): string {
    switch (this.sync.status()) {
      case 'unconfigured':
        return 'non connecté';
      case 'syncing':
        return 'mise à jour…';
      case 'idle':
        return this.sync.pendingCount()
          ? `${this.sync.pendingCount()} modification(s) à envoyer`
          : 'à jour';
      case 'offline':
        return 'hors ligne';
      case 'auth-error':
        return this.sync.gateway() ? 'reconnexion requise' : 'jeton refusé';
      default:
        return 'erreur';
    }
  }

  protected exportHtml(): void {
    downloadFile(this.svc.exportHtml(), `mes-favoris-${today()}.html`, 'text/html;charset=utf-8');
    this.flash('Favoris exportés.');
  }

  protected async exportZip(): Promise<void> {
    this.busy.set(true);
    try {
      downloadFile(
        (await this.svc.exportZipBytes()) as BlobPart,
        `mes-liens-ia-${today()}.zip`,
        'application/zip',
      );
      this.flash('Archive exportée.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async pick(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.plan.set(null);
    this.done.set('');
    this.importError.set('');
    this.deleteMissing.set(false);
    this.analysing.set(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.plan.set(await this.svc.planZip(bytes));
      this.fileName.set(file.name);
    } catch (err) {
      this.importError.set(
        err instanceof ImportError ? err.message : 'Impossible de lire ce fichier.',
      );
    } finally {
      this.analysing.set(false);
    }
  }

  protected cancel(): void {
    this.plan.set(null);
  }

  protected async apply(): Promise<void> {
    const p = this.plan();
    if (!p) return;
    this.busy.set(true);
    try {
      const r = await this.svc.applyZip(p, { deleteMissing: this.deleteMissing() });
      this.plan.set(null);
      this.done.set(
        `Import terminé : ${r.created} créé(s), ${r.updated} modifié(s), ${r.deleted} supprimé(s).`,
      );
    } catch (err) {
      this.importError.set(err instanceof ImportError ? err.message : "Échec de l'import.");
    } finally {
      this.busy.set(false);
    }
  }

  protected async exportJson(): Promise<void> {
    downloadFile(await this.svc.exportJson(), `mes-liens-${today()}.json`, 'application/json');
  }

  protected async importJson(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const replace = confirm(
      'OK = REMPLACER toutes les données locales par ce fichier.\nAnnuler = FUSIONNER (le plus récent gagne).',
    );
    try {
      const r = await this.svc.importJson(await file.text(), replace ? 'replace' : 'merge');
      this.flash(`Import terminé : ${r.links} lien(s), ${r.events} événement(s).`);
    } catch (err) {
      this.importError.set(err instanceof ImportError ? err.message : "Échec de l'import.");
    }
  }

  protected async connect(e: Event): Promise<void> {
    e.preventDefault();
    try {
      await this.sync.configure(this.cfgUrl(), this.cfgToken());
      this.cfgToken.set('');
      this.cfgError.set('');
    } catch (err) {
      this.cfgError.set(err instanceof Error ? err.message : 'Configuration invalide.');
    }
  }

  protected async disconnect(): Promise<void> {
    if (confirm('Déconnecter ? Les données locales sont conservées.')) {
      await this.sync.disconnect();
      this.cfgUrl.set('');
    }
  }

  private flash(msg: string): void {
    this.info.set(msg);
    setTimeout(() => this.info.set(''), 3000);
  }
}

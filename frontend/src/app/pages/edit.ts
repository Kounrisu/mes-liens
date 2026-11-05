import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { LinkForm } from '../shared/link-form';

@Component({
  selector: 'app-edit',
  imports: [LinkForm, RouterLink],
  template: `
    <main class="page">
      @if (!svc.ready()) {
        <p>Chargement…</p>
      } @else if (link(); as l) {
        <section class="card" aria-labelledby="edit-h">
          <div class="row">
            <h2 id="edit-h">Modifier le lien</h2>
            <span class="spacer" style="flex:1"></span>
            <a class="btn small" [href]="l.url" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>
            <button type="button" class="ghost danger small" (click)="remove()">Supprimer</button>
          </div>
          <app-link-form [link]="l" (saved)="back()" />
          <p class="meta">Créé le {{ l.createdAt }} · modifié le {{ l.updatedAt }}</p>
        </section>
        <p><a [routerLink]="['/table']">← Retour au tableau</a></p>
      } @else {
        <p class="empty">Lien introuvable : il a peut-être été supprimé (ici ou sur un autre appareil).</p>
        <p><a [routerLink]="['/table']">← Retour au tableau</a></p>
      }
    </main>
  `,
})
export class EditPage {
  protected readonly svc = inject(LinkService);
  private readonly router = inject(Router);

  /** Paramètre de route :id (lié par withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly link = computed(() => this.svc.find(this.id()));

  protected back(): void {
    void this.router.navigate(['/table']);
  }

  protected async remove(): Promise<void> {
    const l = this.link();
    if (l && confirm(`Supprimer « ${l.title} » ?`)) {
      await this.svc.remove(l.id);
      this.back();
    }
  }
}

import { TranslatePipe } from '../core/i18n';
import { Component, inject, signal } from '@angular/core';
import { LinkService } from '../core/link.service';
import { LinkForm } from '../shared/link-form';
import { LinkViews } from '../shared/link-views';

@Component({
  selector: 'app-home',
  imports: [TranslatePipe, LinkForm, LinkViews],
  template: `
    <main class="page">
      <p class="sr-only" role="status" aria-live="polite">{{ status() | t }}</p>
      <section class="card" aria-labelledby="add-h">
        <h2 id="add-h">{{ 'Enregistrer un lien' | t }}</h2>
        <app-link-form (saved)="status.set('Lien enregistré.')" />
      </section>
      <section aria-labelledby="list-h">
        <h2 id="list-h">{{ 'Mes liens' | t }}</h2>
        <app-link-views [links]="svc.activeLinks()" />
      </section>
    </main>
  `,
})
export class HomePage {
  protected readonly svc = inject(LinkService);
  protected readonly status = signal('');
}

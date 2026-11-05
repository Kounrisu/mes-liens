import { Component, inject, signal } from '@angular/core';
import { LinkService } from '../core/link.service';
import { LinkForm } from '../shared/link-form';
import { LinkList } from '../shared/link-list';

@Component({
  selector: 'app-home',
  imports: [LinkForm, LinkList],
  template: `
    <main class="page">
      <p class="sr-only" role="status" aria-live="polite">{{ status() }}</p>
      <section class="card" aria-labelledby="add-h">
        <h2 id="add-h">Enregistrer un lien</h2>
        <app-link-form (saved)="status.set('Lien enregistré.')" />
      </section>
      <section aria-labelledby="list-h">
        <h2 id="list-h">Mes liens</h2>
        <app-link-list [links]="svc.activeLinks()" />
      </section>
    </main>
  `,
})
export class HomePage {
  protected readonly svc = inject(LinkService);
  protected readonly status = signal('');
}

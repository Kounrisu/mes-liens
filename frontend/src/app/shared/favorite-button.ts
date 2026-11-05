import { TranslatePipe } from '../core/i18n';
import { Component, inject, input, signal } from '@angular/core';
import { LinkService } from '../core/link.service';
import { Link } from '../core/models';

@Component({
  imports: [TranslatePipe],
  selector: 'app-favorite-button',
  template: `
    <button
      type="button"
      class="btn small"
      [class.on]="link().favorite"
      [disabled]="busy()"
      [attr.aria-pressed]="!!link().favorite"
      [attr.aria-label]="
        (link().favorite ? 'Retirer des favoris : ' : 'Ajouter aux favoris : ') + link().title | t
      "
      (click)="toggle()"
    >
      {{ (link().favorite ? '★ Favori' : '☆ Favori') | t }}
    </button>
    @if (error()) {
      <span class="error" role="alert"> {{ error() | t }} </span>
    }
  `,
})
export class FavoriteButton {
  private readonly svc = inject(LinkService);
  readonly link = input.required<Link>();
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.svc.classifyMany([this.link().id], { favorite: !this.link().favorite });
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Modification impossible.');
    } finally {
      this.busy.set(false);
    }
  }
}

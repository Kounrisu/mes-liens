import { Component, computed, inject, input } from '@angular/core';
import { LinkService } from '../core/link.service';
import { Link } from '../core/models';

/** Bouton « étoile » : met un lien dans la page Focus (en dernière position) ou l'en retire. */
@Component({
  selector: 'app-focus-button',
  template: `
    <button type="button" class="btn small" [class.on]="inFocus()" [attr.aria-pressed]="inFocus()"
            [attr.aria-label]="(inFocus() ? 'Retirer du focus : ' : 'Mettre en focus : ') + link().title" (click)="toggle()">
      {{ inFocus() ? '★ En focus' : '☆ Focus' }}
    </button>
  `,
})
export class FocusButton {
  private readonly svc = inject(LinkService);
  readonly link = input.required<Link>();
  protected readonly inFocus = computed(() => this.link().focusRank !== null);

  protected async toggle(): Promise<void> {
    const l = this.link();
    if (l.focusRank === null) await this.svc.addToFocus(l.id);
    else await this.svc.removeFromFocus(l.id);
  }
}

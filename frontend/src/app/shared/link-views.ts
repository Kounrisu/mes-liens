import { TranslatePipe } from '../core/i18n';
import { Component, input, signal } from '@angular/core';
import { Link } from '../core/models';
import { LinkList } from './link-list';
import { LinkRows } from './link-rows';
import { LinksTable } from './links-table';

export type ViewMode = 'cards' | 'list' | 'table' | 'sources';

const KEY = 'mesliens.view';
const MODES: readonly { mode: ViewMode; label: string }[] = [
  { mode: 'cards', label: 'Cartes' },
  { mode: 'list', label: 'Liste' },
  { mode: 'table', label: 'Tableau' },
  { mode: 'sources', label: 'Par source' },
];

function savedMode(): ViewMode {
  try {
    const v = localStorage.getItem(KEY);
    return MODES.some((m) => m.mode === v) ? (v as ViewMode) : 'cards';
  } catch {
    return 'cards'; // stockage indisponible (navigation privée…) : valeur par défaut
  }
}

/** Plusieurs façons de voir les mêmes liens : cartes, liste compacte, tableau, regroupé par source. Le choix est mémorisé sur l'appareil. */
@Component({
  selector: 'app-link-views',
  imports: [TranslatePipe, LinkList, LinkRows, LinksTable],
  template: `
    <div class="view-switch" role="group" [attr.aria-label]="'Mode d\\'affichage' | t">
      @for (m of modes; track m.mode) {
        <button
          type="button"
          [class.on]="mode() === m.mode"
          [attr.aria-pressed]="mode() === m.mode"
          (click)="set(m.mode)"
        >
          {{ m.label | t }}
        </button>
      }
    </div>
    @switch (mode()) {
      @case ('list') {
        <app-link-rows [links]="links()" />
      }
      @case ('sources') {
        <app-link-rows [links]="links()" [grouped]="true" />
      }
      @case ('table') {
        <app-links-table [links]="links()" />
      }
      @default {
        <app-link-list [links]="links()" />
      }
    }
  `,
})
export class LinkViews {
  readonly links = input.required<Link[]>();

  protected readonly modes = MODES;
  protected readonly mode = signal<ViewMode>(savedMode());

  protected set(m: ViewMode): void {
    this.mode.set(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* non mémorisé : sans conséquence */
    }
  }
}

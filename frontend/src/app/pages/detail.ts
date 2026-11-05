import { LinkInsight } from '../shared/link-insight';
import { libraryOf, LEARNING_STATES, RESOURCE_TYPES } from '../core/library';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { LinkEvent } from '../core/models';
import { childrenOf, siteOf } from '../core/sites';
import { FocusButton } from '../shared/focus-button';

const EVENT_LABELS: Record<LinkEvent['type'], string> = {
  created: 'Lien enregistré',
  tagged: 'Étiquette ajoutée',
  untagged: 'Étiquette retirée',
  note_edited: 'Note modifiée',
  screenshot_added: 'Capture ajoutée',
  revisited: 'Lien revisité',
};

/** Fiche d'un lien : toutes ses informations. Le site lui-même s'ouvre depuis le bouton « Aller au site ». */
@Component({
  selector: 'app-detail',
  imports: [LinkInsight, DatePipe, RouterLink, FocusButton],
  templateUrl: './detail.html',
})
export class DetailPage {
  protected readonly svc = inject(LinkService);
  protected readonly lib = libraryOf;
  protected readonly states = LEARNING_STATES;
  protected readonly types = RESOURCE_TYPES;
  private readonly router = inject(Router);

  /** Paramètre de route :id (lié par withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly link = computed(() => this.svc.find(this.id()));
  protected readonly shot = computed(() => {
    const sid = this.link()?.screenshotId;
    return sid ? (this.svc.screenshotUrls()[sid] ?? null) : null;
  });
  protected readonly events = signal<LinkEvent[]>([]);
  /** Le site auquel ce lien est rattaché, et (si c'est un site) ses liens. */
  protected readonly site = computed(() => {
    const l = this.link();
    return l ? siteOf(this.svc.links(), l) : undefined;
  });
  protected readonly children = computed(() => {
    const l = this.link();
    return l && l.kind === 'site' ? childrenOf(this.svc.links(), l.id) : [];
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.svc.links(); // recharge l'historique quand la liste change (modification, synchro)
      if (this.svc.ready()) void this.svc.storage.listEvents(id).then((e) => this.events.set(e));
    });
  }

  protected label(e: LinkEvent): string {
    return EVENT_LABELS[e.type];
  }

  protected detail(e: LinkEvent): string {
    const p = e.payload;
    if (e.type === 'tagged' || e.type === 'untagged') return String(p['tag'] ?? '');
    return '';
  }

  protected async remove(): Promise<void> {
    const l = this.link();
    const n = this.children().length;
    const extra = n
      ? `\n\nLes ${n} lien(s) rattaché(s) à ce site restent enregistrés, sans site.`
      : '';
    if (l && confirm(`Supprimer « ${l.title} » ?${extra}`)) {
      await this.svc.remove(l.id);
      void this.router.navigate(['/table']);
    }
  }
}

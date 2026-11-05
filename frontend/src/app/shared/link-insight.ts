import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Link } from '../core/models';
import { HEALTH_LABELS, InsightsService } from '../core/insights.service';
import { LinkService } from '../core/link.service';
@Component({
  selector: 'app-link-insight',
  imports: [DatePipe],
  template: `
    @if (record(); as r) {
      @if (!link().screenshotId && image(); as src) {
        <img
          class="thumb"
          [src]="src"
          alt="Capture automatique de la page enregistrée"
          loading="lazy"
        />
      }
      @if (detail()) {
        <p class="meta">
          {{ labels[r.status] || r.status }}
          @if (r.checkedAt) {
            · Vérifié le {{ r.checkedAt | date: 'dd/MM/yyyy HH:mm' }}
          }
          @if (r.httpStatus) {
            · HTTP {{ r.httpStatus }}
          }
        </p>
        @if (r.title) {
          <p>
            <strong>{{ r.title }}</strong>
          </p>
        }
        @if (r.description) {
          <p>{{ r.description }}</p>
        }
        @if (r.capturedAt) {
          <p class="meta">Capture du {{ r.capturedAt | date: 'dd/MM/yyyy HH:mm' }}</p>
        }
        @if (!r.screenshotId) {
          <p class="meta">
            Pas de capture automatique disponible. Tu peux ajouter ta propre capture dans Modifier.
          </p>
        }
      }
    } @else if (detail()) {
      <p class="meta">
        Pas encore vérifié. Les pages publiques sont traitées progressivement en arrière-plan.
      </p>
    }
    @if (detail()) {
      <button type="button" [disabled]="busy()" (click)="recheck()">Vérifier à nouveau</button>
      <p role="status" class="meta">{{ message() }}</p>
    }
  `,
})
export class LinkInsight {
  readonly link = input.required<Link>();
  readonly detail = input(false);
  readonly svc = inject(InsightsService);
  readonly labels = HEALTH_LABELS;
  readonly links = inject(LinkService);
  readonly record = computed(() => {
    const r = this.svc.records()[this.link().id];
    return r?.url === this.link().url ? r : undefined;
  });
  readonly image = computed(() => {
    const id = this.record()?.screenshotId;
    return id ? this.svc.screenshots()[id] : undefined;
  });
  readonly busy = signal(false);
  readonly message = signal('');
  constructor() {
    effect(() => {
      this.links.links();
      const manual = this.link().screenshotId;
      if (manual) void this.links.ensureScreenshot(manual);
      const id = this.record()?.screenshotId;
      if (id && !manual) void this.svc.loadScreenshot(id);
    });
  }
  async recheck() {
    this.busy.set(true);
    try {
      await this.svc.recheck([this.link().id]);
      this.message.set(
        'Contrôle ajouté à la file. Le résultat apparaîtra après traitement et synchronisation.',
      );
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : 'Serveur indisponible.');
    } finally {
      this.busy.set(false);
    }
  }
}

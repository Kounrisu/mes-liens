import { Component, computed, inject, signal } from '@angular/core';
import { CategoryLabelPipe, TranslatePipe } from '../core/i18n';
import { planCourseClassification, CourseChange } from '../core/course-classification';
import { LinkService } from '../core/link.service';

@Component({
  selector: 'app-course-organizer',
  imports: [TranslatePipe, CategoryLabelPipe],
  template: `<details class="card">
    <summary>{{ 'Classer mes formations' | t }} · {{ suggestions().length }}</summary>
    <p>
      {{
        'Classement proposé à partir du titre, des étiquettes et de la plateforme. Les notes et les catégories précises sont conservées.'
          | t
      }}
    </p>
    <button type="button" [disabled]="busy() || !suggestions().length" (click)="preview()">
      {{ 'Examiner les suggestions' | t }}
    </button>
    @if (plan(); as rows) {
      <p class="meta">{{ '{0} formation(s) à classer' | t: [rows.length] }}</p>
      <ul class="rows classification-preview">
        @for (p of rows; track p.before.id) {
          <li class="rowitem">
            <label class="check"
              ><input
                type="checkbox"
                [checked]="selected().has(p.before.id)"
                (change)="toggle(p.before.id)"
                [disabled]="busy()"
              />
              <span
                >{{ p.before.title
                }}<small
                  >{{ p.before.category || '—' }} → {{ p.category | categoryLabel }}</small
                ></span
              >
            </label>
          </li>
        }
      </ul>
      <button
        type="button"
        class="primary"
        [disabled]="busy() || !selected().size"
        (click)="apply()"
      >
        {{ 'Appliquer à {0} lien(s)' | t: [selected().size] }}
      </button>
    }
    @if (message()) {
      <p role="status">{{ message() | t }}</p>
    }
  </details>`,
})
export class CourseOrganizer {
  private readonly svc = inject(LinkService);
  readonly suggestions = computed(() => planCourseClassification(this.svc.links()));
  readonly plan = signal<CourseChange[] | null>(null);
  readonly selected = signal(new Set<string>());
  readonly busy = signal(false);
  readonly message = signal('');
  preview() {
    const plan = this.suggestions();
    this.plan.set(plan);
    this.selected.set(new Set(plan.map((p) => p.before.id)));
    this.message.set('');
  }
  toggle(id: string) {
    this.selected.update((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  async apply() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const count = await this.svc.applyCourseClassification(
        (this.plan() ?? []).filter((p) => this.selected().has(p.before.id)),
      );
      this.message.set(`${count} lien(s) mis à jour.`);
      this.plan.set(null);
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : 'Modification impossible.');
    } finally {
      this.busy.set(false);
    }
  }
}

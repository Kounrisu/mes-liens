import { I18nService, TranslatePipe } from '../core/i18n';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { LinkService } from '../core/link.service';
import { InsightsService } from '../core/insights.service';
import { categorySuggestions } from '../core/catalog';
import { parseTags, tagCounts } from '../core/link-utils';
import { Link } from '../core/models';

type Action =
  | 'tags'
  | 'removeTags'
  | 'category'
  | 'clearCategory'
  | 'collection'
  | 'favorite'
  | 'unfavorite'
  | 'review'
  | 'inbox'
  | 'archive'
  | 'restore'
  | 'check'
  | 'delete';

export function toggleSelection(selected: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

@Component({
  imports: [TranslatePipe],
  selector: 'app-selection-toolbar',
  templateUrl: './selection-toolbar.html',
  host: { '[class.has-selection]': 'picked().length > 0' },
})
export class SelectionToolbar {
  protected readonly i18n = inject(I18nService);
  private readonly svc = inject(LinkService);
  private readonly insights = inject(InsightsService);
  readonly links = input.required<Link[]>();
  readonly shown = input.required<Link[]>();
  readonly selected = model<ReadonlySet<string>>(new Set());
  readonly picked = computed(() => this.links().filter((l) => this.selected().has(l.id)));
  readonly busy = signal(false);
  readonly panel = signal<'tags' | 'category' | 'collection' | ''>('');
  readonly value = signal('');
  readonly message = signal('');
  readonly error = signal('');
  readonly categories = computed(() => categorySuggestions(this.svc.links()));
  readonly tags = computed(() => tagCounts(this.svc.links()));
  readonly collections = computed(() =>
    [...new Set(this.svc.links().flatMap((l) => l.library?.collections ?? []))].sort(),
  );

  constructor() {
    effect(() => {
      const allowed = new Set(this.links().map((l) => l.id));
      // A hidden selection must not return when a parent view/filter changes back.
      untracked(() => {
        const selected = this.selected();
        const next = new Set([...selected].filter((id) => allowed.has(id)));
        if (next.size !== selected.size) this.selected.set(next);
      });
    });
  }
  clear(): void {
    this.selected.set(new Set());
  }
  select(all: boolean): void {
    this.selected.set(new Set((all ? this.links() : this.shown()).map((l) => l.id)));
  }
  open(panel: 'tags' | 'category' | 'collection'): void {
    this.panel.set(this.panel() === panel ? '' : panel);
    this.value.set('');
  }
  text(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
  async apply(action: Action): Promise<void> {
    const picked = this.picked();
    if (!picked.length || this.busy()) return;
    const ids = picked.map((l) => l.id);
    if (
      action === 'delete' &&
      !confirm(
        this.i18n.t(
          `Supprimer les ${ids.length} liens sélectionnés ?\n\n${picked
            .slice(0, 5)
            .map((l) => l.title)
            .join('\n')}`,
        ),
      )
    )
      return;
    if (['tags', 'removeTags', 'category', 'collection'].includes(action) && !this.value().trim())
      return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      if (action === 'check') {
        await this.insights.recheck(ids);
        this.message.set(`${ids.length} lien(s) ajoutés à la file de vérification.`);
      } else if (action === 'delete') {
        const count = await this.svc.removeMany(ids);
        this.selected.set(new Set());
        this.message.set(`${count} lien(s) supprimés.`);
      } else {
        const patch =
          action === 'tags'
            ? { tags: parseTags(this.value()) }
            : action === 'removeTags'
              ? { removeTags: parseTags(this.value()) }
              : action === 'category'
                ? { category: this.value() }
                : action === 'clearCategory'
                  ? { category: '' }
                  : action === 'collection'
                    ? { collection: this.value() }
                    : action === 'favorite' || action === 'unfavorite'
                      ? { favorite: action === 'favorite' }
                      : {
                          library:
                            action === 'review' || action === 'inbox'
                              ? { reviewed: action === 'review' }
                              : { archived: action === 'archive' },
                        };
        const count = await this.svc.classifyMany(ids, patch);
        this.message.set(`${count} lien(s) mis à jour.`);
        // Keep the selection for another action; the effect removes links that leave the view.
        this.panel.set('');
        this.value.set('');
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Modification impossible.');
    } finally {
      this.busy.set(false);
    }
  }
}

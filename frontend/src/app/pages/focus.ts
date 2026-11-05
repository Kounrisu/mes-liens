import { CategoryLabelPipe, TranslatePipe, LocalDatePipe } from '../core/i18n';
import { FavoriteButton } from '../shared/favorite-button';
import { libraryOf, LEARNING_STATES } from '../core/library';
import { LinkInsight } from '../shared/link-insight';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UNCATEGORIZED, categoryCounts } from '../core/catalog';
import { focusOrder } from '../core/focus';
import { LinkService } from '../core/link.service';
import { Link } from '../core/models';
import { FocusButton } from '../shared/focus-button';

/** Tableau de bord : mes favoris à apprendre, classés par rang, et un aperçu de la collection. */
@Component({
  selector: 'app-focus',
  imports: [CategoryLabelPipe, TranslatePipe, FavoriteButton, LocalDatePipe, RouterLink, FocusButton, LinkInsight],
  templateUrl: './focus.html',
})
export class FocusPage {
  protected readonly svc = inject(LinkService);
  protected readonly lib = libraryOf;
  protected readonly states = LEARNING_STATES;

  protected readonly ranked = computed(() =>
    focusOrder(this.svc.links().filter((l) => !libraryOf(l).archived)),
  );
  protected readonly suggestions = computed(() =>
    this.svc
      .activeLinks()
      .filter((l) => l.focusRank === null)
      .slice(0, 6),
  );
  protected readonly topCategories = computed(() =>
    categoryCounts(this.svc.links())
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
  );
  protected readonly uncategorized = computed(
    () => this.svc.links().filter((l) => !l.category).length,
  );
  protected readonly uncategorizedLabel = UNCATEGORIZED;
  protected readonly addedThisWeek = computed(() => {
    const since = Date.now() - 7 * 24 * 3600 * 1000;
    return this.svc.links().filter((l) => Date.parse(l.createdAt) >= since).length;
  });

  protected up(l: Link): Promise<void> {
    return this.svc.moveInFocus(l.id, -1);
  }

  protected down(l: Link): Promise<void> {
    return this.svc.moveInFocus(l.id, 1);
  }

  protected remove(l: Link): Promise<void> {
    return this.svc.removeFromFocus(l.id);
  }
}

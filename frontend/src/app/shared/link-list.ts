import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LinkService } from '../core/link.service';
import { filterLinks, tagCounts } from '../core/link-utils';
import { Link } from '../core/models';

/** Liste en cartes avec recherche et filtre par étiquettes. Utilisée par l'accueil et les pages de catégorie. */
@Component({
  selector: 'app-link-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './link-list.html',
})
export class LinkList {
  protected readonly svc = inject(LinkService);

  readonly links = input.required<Link[]>();

  protected readonly query = signal('');
  protected readonly activeTags = signal<string[]>([]);
  protected readonly visible = computed(() => filterLinks(this.links(), this.query(), this.activeTags()));
  protected readonly allTags = computed(() => tagCounts(this.links()));

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected toggleTag(tag: string): void {
    this.activeTags.update((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  protected resetFilters(): void {
    this.query.set('');
    this.activeTags.set([]);
  }

  protected catParam(l: Link): string {
    return l.category || '_';
  }

  protected async remove(l: Link): Promise<void> {
    if (confirm(`Supprimer « ${l.title} » ?`)) await this.svc.remove(l.id);
  }
}

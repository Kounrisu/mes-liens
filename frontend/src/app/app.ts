import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ImportError, LinkService } from './core/link.service';
import { isImage, shrinkImage } from './core/image';
import { filterLinks, normalizeUrl, parseTags, tagCounts } from './core/link-utils';
import { Link } from './core/models';

@Component({
  imports: [DatePipe],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly svc = inject(LinkService);

  // formulaire
  protected readonly url = signal('');
  protected readonly title = signal('');
  protected readonly tagsInput = signal('');
  protected readonly note = signal('');
  protected readonly pending = signal<{ blob: Blob; preview: string } | null>(null);
  protected readonly error = signal('');
  protected readonly dragging = signal(false);
  protected readonly status = signal('');

  // liste
  protected readonly query = signal('');
  protected readonly activeTags = signal<string[]>([]);
  protected readonly visible = computed(() => filterLinks(this.svc.links(), this.query(), this.activeTags()));
  protected readonly allTags = computed(() => tagCounts(this.svc.links()));

  async ngOnInit(): Promise<void> {
    await this.svc.init();
    // Pré-remplissage par le bookmarklet / Raccourci iOS : ?url=…&title=… (le texte est affiché via {{ }}, jamais en HTML brut)
    const p = new URLSearchParams(window.location.search);
    const u = p.get('url');
    if (u) {
      this.url.set(u);
      this.title.set(p.get('title') ?? '');
      history.replaceState(null, '', window.location.pathname);
    }
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  // ---- captures : coller, glisser-déposer, choisir un fichier ----

  @HostListener('window:paste', ['$event'])
  protected onPaste(e: ClipboardEvent): void {
    const file = Array.from(e.clipboardData?.files ?? []).find(isImage);
    if (file) {
      e.preventDefault();
      void this.setScreenshot(file);
    }
  }

  protected onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = Array.from(e.dataTransfer?.files ?? []).find(isImage);
    if (file) void this.setScreenshot(file);
    else this.error.set("Ce fichier n'est pas une image (PNG, JPEG, WebP ou GIF).");
  }

  protected onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && isImage(file)) void this.setScreenshot(file);
    input.value = '';
  }

  private async setScreenshot(file: Blob): Promise<void> {
    this.clearScreenshot();
    const blob = await shrinkImage(file);
    this.pending.set({ blob, preview: URL.createObjectURL(blob) });
    this.error.set('');
  }

  protected clearScreenshot(): void {
    const p = this.pending();
    if (p) URL.revokeObjectURL(p.preview);
    this.pending.set(null);
  }

  // ---- enregistrement ----

  protected async save(e: Event): Promise<void> {
    e.preventDefault();
    const url = normalizeUrl(this.url());
    if (!url) {
      this.error.set('URL invalide : seules les adresses http(s) sont acceptées.');
      return;
    }
    await this.svc.add({
      url,
      title: this.title(),
      tags: parseTags(this.tagsInput()),
      note: this.note(),
      screenshot: this.pending()?.blob ?? null,
    });
    this.url.set('');
    this.title.set('');
    this.tagsInput.set('');
    this.note.set('');
    this.clearScreenshot();
    this.error.set('');
    this.flash('Lien enregistré.');
  }

  protected async remove(l: Link): Promise<void> {
    if (confirm(`Supprimer « ${l.title} » ?`)) {
      await this.svc.remove(l.id);
      this.flash('Lien supprimé.');
    }
  }

  protected toggleTag(tag: string): void {
    this.activeTags.update((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  protected resetFilters(): void {
    this.query.set('');
    this.activeTags.set([]);
  }

  // ---- export / import ----

  protected async doExport(): Promise<void> {
    const blob = new Blob([await this.svc.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mes-liens-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  protected async doImport(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const replace = confirm('OK = REMPLACER toutes les données locales par ce fichier.\nAnnuler = FUSIONNER (le plus récent gagne).');
    try {
      const r = await this.svc.importJson(await file.text(), replace ? 'replace' : 'merge');
      this.flash(`Import terminé : ${r.links} lien(s), ${r.events} événement(s).`);
    } catch (err) {
      this.error.set(err instanceof ImportError ? err.message : "Échec de l'import.");
    }
  }

  private flash(msg: string): void {
    this.status.set(msg);
    setTimeout(() => this.status.set(''), 3000);
  }
}

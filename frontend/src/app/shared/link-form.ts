import { Component, HostListener, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { categoryCounts, detectSource, normalizeCategory } from '../core/catalog';
import { isImage, shrinkImage } from '../core/image';
import { LinkService } from '../core/link.service';
import { normalizeUrl, parseTags, tagCounts } from '../core/link-utils';
import { Link } from '../core/models';

/** Formulaire unique pour créer (sans `link`) et modifier (avec `link`) : mêmes champs, même validation. */
@Component({
  selector: 'app-link-form',
  templateUrl: './link-form.html',
})
export class LinkForm implements OnInit {
  protected readonly svc = inject(LinkService);

  readonly link = input<Link | undefined>(undefined);
  readonly saved = output<Link>();

  protected readonly url = signal('');
  protected readonly title = signal('');
  protected readonly tagsInput = signal('');
  protected readonly note = signal('');
  protected readonly category = signal('');
  protected readonly source = signal('');
  protected readonly pending = signal<{ blob: Blob; preview: string } | null>(null);
  protected readonly removeShot = signal(false);
  protected readonly error = signal('');
  protected readonly dragging = signal(false);
  protected readonly busy = signal(false);

  private categoryTouched = false;
  private sourceTouched = false;

  protected readonly categories = computed(() => categoryCounts(this.svc.links()).map((c) => c.category));
  protected readonly knownTags = computed(() => tagCounts(this.svc.links()).map((t) => t.tag));
  protected readonly currentShot = computed(() => {
    const id = this.link()?.screenshotId;
    return id && !this.removeShot() ? (this.svc.screenshotUrls()[id] ?? null) : null;
  });

  ngOnInit(): void {
    const l = this.link();
    if (l) {
      this.url.set(l.url);
      this.title.set(l.title);
      this.tagsInput.set(l.tags.join(', '));
      this.note.set(l.note);
      this.category.set(l.category);
      this.source.set(l.source);
      this.categoryTouched = this.sourceTouched = true; // ne pas écraser ce qui est déjà enregistré
      return;
    }
    // Pré-remplissage par le bookmarklet / Raccourci iOS : ?url=…&title=… (affiché via {{ }}, jamais en HTML brut)
    const p = new URLSearchParams(window.location.search);
    const u = p.get('url');
    if (u) {
      this.setUrl(u);
      this.title.set(p.get('title') ?? '');
      history.replaceState(null, '', window.location.pathname);
    }
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected setUrl(v: string): void {
    this.url.set(v);
    // Site reconnu (Udemy, Frontend Masters…) : propose source et catégorie tant que l'utilisateur n'y a pas touché.
    const n = normalizeUrl(v);
    const d = n ? detectSource(n) : null;
    if (d) {
      if (!this.sourceTouched) this.source.set(d.source);
      if (!this.categoryTouched) this.category.set(d.category);
    }
  }

  protected setCategory(v: string): void {
    this.categoryTouched = true;
    this.category.set(v);
  }

  protected setSource(v: string): void {
    this.sourceTouched = true;
    this.source.set(v);
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
    this.clearPending();
    const blob = await shrinkImage(file);
    this.pending.set({ blob, preview: URL.createObjectURL(blob) });
    this.removeShot.set(false);
    this.error.set('');
  }

  protected clearPending(): void {
    const p = this.pending();
    if (p) URL.revokeObjectURL(p.preview);
    this.pending.set(null);
  }

  // ---- enregistrement ----

  protected async submit(e: Event): Promise<void> {
    e.preventDefault();
    const url = normalizeUrl(this.url());
    if (!url) {
      this.error.set('URL invalide : seules les adresses http(s) sont acceptées.');
      return;
    }
    this.busy.set(true);
    try {
      const fields = {
        url,
        title: this.title(),
        tags: parseTags(this.tagsInput()),
        note: this.note(),
        category: normalizeCategory(this.category()),
        source: this.source(),
      };
      const existing = this.link();
      let result: Link;
      if (existing) {
        const shot = this.pending()?.blob ?? (this.removeShot() ? 'remove' : 'keep');
        result = await this.svc.update(existing.id, fields, shot);
      } else {
        result = await this.svc.add({ ...fields, screenshot: this.pending()?.blob ?? null });
        this.reset();
      }
      this.error.set('');
      this.saved.emit(result);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : "Échec de l'enregistrement.");
    } finally {
      this.busy.set(false);
    }
  }

  private reset(): void {
    this.url.set('');
    this.title.set('');
    this.tagsInput.set('');
    this.note.set('');
    this.category.set('');
    this.source.set('');
    this.categoryTouched = this.sourceTouched = false;
    this.clearPending();
  }
}

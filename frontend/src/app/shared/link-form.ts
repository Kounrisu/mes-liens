import {
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { findSiteForUrl, sitesOf } from '../core/sites';
import {
  YOUTUBE_CATEGORIES,
  categoryCounts,
  detectSource,
  normalizeCategory,
} from '../core/catalog';
import { isImage, shrinkImage } from '../core/image';
import { LinkService } from '../core/link.service';
import { normalizeUrl, parseTags, tagCounts } from '../core/link-utils';
import { Link } from '../core/models';
import { libraryOf, duplicatesOf } from '../core/library';
import { LibraryEditor } from './library-editor';
import { RouterLink } from '@angular/router';

/** Formulaire unique pour créer (sans `link`) et modifier (avec `link`) : mêmes champs, même validation. */
@Component({
  selector: 'app-link-form',
  imports: [LibraryEditor, RouterLink],
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
  protected readonly library = signal(libraryOf({}));
  protected readonly duplicates = computed(() =>
    duplicatesOf(this.svc.links(), normalizeUrl(this.url()) ?? '', this.link()?.id),
  );

  protected readonly isSite = signal(false);
  protected readonly parentId = signal('');

  private categoryTouched = false;
  private sourceTouched = false;
  private parentTouched = false;
  /** ?site=<id> (bouton « Ajouter un lien à ce site ») : appliqué dès que les liens sont chargés. */
  private pendingSite = '';

  protected readonly sites = computed(() =>
    sitesOf(this.svc.links()).filter((s) => s.id !== this.link()?.id),
  );
  private readonly suggestedSite = computed(() =>
    findSiteForUrl(this.sites(), normalizeUrl(this.url())),
  );

  constructor() {
    effect(() => {
      if (this.svc.ready() && this.link()?.screenshotId)
        void this.svc.ensureScreenshot(this.link()!.screenshotId!);
    });
    effect(() => {
      if (!this.svc.ready()) return;
      // Arrivée par « Ajouter un lien à ce site » : le site et son adresse (à compléter) sont préremplis.
      if (this.pendingSite) {
        const s = this.sites().find((x) => x.id === this.pendingSite);
        this.pendingSite = '';
        if (s) this.chooseParent(s.id, s.url);
        return;
      }
      // Sinon, propose le site qui correspond à l'adresse saisie, tant que l'utilisateur n'a pas choisi lui-même.
      const s = this.suggestedSite();
      if (s && !this.parentTouched && !this.isSite() && this.parentId() === '')
        this.chooseParent(s.id);
    });
  }

  protected readonly categories = computed(() => [
    ...new Set([...categoryCounts(this.svc.links()).map((c) => c.category), ...YOUTUBE_CATEGORIES]),
  ]);
  protected readonly knownTags = computed(() => tagCounts(this.svc.links()).map((t) => t.tag));
  protected readonly currentShot = computed(() => {
    const id = this.link()?.screenshotId;
    return id && !this.removeShot() ? (this.svc.screenshotUrls()[id] ?? null) : null;
  });

  ngOnInit(): void {
    const l = this.link();
    if (l) {
      this.library.set(libraryOf(l));
      this.url.set(l.url);
      this.title.set(l.title);
      this.tagsInput.set(l.tags.join(', '));
      this.note.set(l.note);
      this.category.set(l.category);
      this.source.set(l.source);
      this.isSite.set(l.kind === 'site');
      this.parentId.set(l.parentId ?? '');
      this.categoryTouched = this.sourceTouched = this.parentTouched = true; // ne pas écraser ce qui est déjà enregistré
      return;
    }
    const site = new URLSearchParams(window.location.search).get('site');
    if (site) {
      this.pendingSite = site;
      history.replaceState(null, '', window.location.pathname);
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

  /** Choix d'un site parent (par l'utilisateur ou par suggestion). Prérempli : adresse (si fournie), catégorie et source, tant qu'on n'y a pas touché. */
  protected chooseParent(id: string, url?: string): void {
    this.parentId.set(id);
    const s = this.sites().find((x) => x.id === id);
    if (!s) return;
    if (url && this.url() === '') this.url.set(url);
    if (!this.categoryTouched && !this.category() && s.category) this.category.set(s.category);
    if (!this.sourceTouched && !this.source()) this.source.set(s.title);
  }

  protected pickParent(id: string): void {
    this.parentTouched = true;
    if (id === '') this.parentId.set('');
    else this.chooseParent(id);
  }

  protected setSiteFlag(checked: boolean): void {
    this.isSite.set(checked);
    if (checked) {
      this.parentId.set(''); // un site n'est rattaché à rien
      this.parentTouched = true;
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
    if (
      !this.link() &&
      this.duplicates().length &&
      !confirm('Cette adresse est déjà enregistrée. Créer quand même un autre lien ?')
    )
      return;
    const url = normalizeUrl(this.url());
    if (!url) {
      this.error.set('URL invalide : seules les adresses http(s) sont acceptées.');
      return;
    }
    this.busy.set(true);
    try {
      const fields = {
        library: this.library(),
        url,
        title: this.title(),
        tags: parseTags(this.tagsInput()),
        note: this.note(),
        category: normalizeCategory(this.category()),
        source: this.source(),
        kind: this.isSite() ? ('site' as const) : ('link' as const),
        parentId: this.isSite() || this.parentId() === '' ? null : this.parentId(),
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
    this.library.set(libraryOf({}));
    this.url.set('');
    this.title.set('');
    this.tagsInput.set('');
    this.note.set('');
    this.category.set('');
    this.source.set('');
    this.categoryTouched = this.sourceTouched = this.parentTouched = false;
    this.isSite.set(false);
    this.parentId.set('');
    this.clearPending();
  }
}

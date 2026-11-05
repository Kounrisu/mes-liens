import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UNCATEGORIZED, categoryCounts } from './core/catalog';
import { ImportError, LinkService } from './core/link.service';
import { SyncService } from './core/sync.service';

@Component({
  imports: [DatePipe, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly svc = inject(LinkService);
  protected readonly sync = inject(SyncService);

  protected readonly cfgUrl = signal('');
  protected readonly cfgToken = signal('');
  protected readonly cfgError = signal('');
  protected readonly error = signal('');
  protected readonly status = signal('');

  protected readonly categories = computed(() => categoryCounts(this.svc.links()));
  protected readonly uncategorizedCount = computed(() => this.svc.links().filter((l) => !l.category).length);
  protected readonly uncategorizedLabel = UNCATEGORIZED;
  protected readonly siteCount = computed(() => this.svc.links().filter((l) => l.kind === 'site').length);
  protected readonly focusCount = computed(() => this.svc.links().filter((l) => l.focusRank !== null).length);

  async ngOnInit(): Promise<void> {
    await this.svc.init();
    await this.sync.init();
    this.cfgUrl.set(this.sync.serverUrl());
  }

  protected val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  // ---- synchronisation ----

  protected async connect(e: Event): Promise<void> {
    e.preventDefault();
    try {
      await this.sync.configure(this.cfgUrl(), this.cfgToken());
      this.cfgToken.set('');
      this.cfgError.set('');
    } catch (err) {
      this.cfgError.set(err instanceof Error ? err.message : 'Configuration invalide.');
    }
  }

  protected async disconnect(): Promise<void> {
    if (confirm('Déconnecter la synchronisation ? Les données locales sont conservées.')) {
      await this.sync.disconnect();
      this.cfgUrl.set('');
    }
  }

  protected statusLabel(): string {
    switch (this.sync.status()) {
      case 'unconfigured': return 'Non synchronisé';
      case 'syncing': return 'Synchronisation…';
      case 'idle': return this.sync.pendingCount() ? `${this.sync.pendingCount()} à envoyer` : 'Synchronisé';
      case 'offline': return 'Hors ligne';
      case 'auth-error': return 'Jeton refusé';
      default: return 'Erreur de synchro';
    }
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
      this.error.set('');
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

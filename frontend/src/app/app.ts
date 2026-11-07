import { CategoryLabelPipe, TranslatePipe } from './core/i18n';
import { Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UNCATEGORIZED, categoryCounts, isYoutube, detectSource } from './core/catalog';
import { youtubePlaylists } from './core/youtube-playlists';
import { sourcesOf } from './core/sources';
import { I18nService } from './core/i18n';
import { LinkService } from './core/link.service';
import { SyncService } from './core/sync.service';

@Component({
  imports: [CategoryLabelPipe, TranslatePipe, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly svc = inject(LinkService);
  protected readonly sync = inject(SyncService);
  protected readonly tableCount = computed(() => this.svc.activeLinks().length);
  protected readonly youtubeCount = computed(
    () => this.svc.activeLinks().filter((l) => isYoutube(l.url)).length,
  );
  protected readonly sourceCount = computed(() => sourcesOf(this.svc.links()).length);
  protected readonly savedSources = computed(() =>
    [
      { name: 'Facebook', label: 'Facebook enregistrés' },
      { name: 'Instagram', label: 'Instagram enregistrés' },
      { name: 'X', label: 'X enregistrés' },
    ].map((source) => ({
      ...source,
      count: this.svc
        .activeLinks()
        .filter(
          (link) =>
            link.kind !== 'site' &&
            (link.source.trim() || detectSource(link.url)?.source || '').toLowerCase() ===
              source.name.toLowerCase(),
        ).length,
    })),
  );
  protected readonly playlistCount = computed(
    () => youtubePlaylists(this.svc.activeLinks()).length,
  );

  protected readonly notConnected = computed(() => this.sync.status() === 'unconfigured');
  /** Appareil neuf : ni connexion au serveur, ni aucun lien local → on guide l'utilisateur au lieu d'afficher une page vide muette. */
  protected readonly showOnboarding = computed(
    () => this.notConnected() && !this.sync.probing() && this.svc.ready() && this.svc.count() === 0,
  );
  protected readonly categories = computed(() => categoryCounts(this.svc.activeLinks()));
  protected readonly uncategorizedCount = computed(
    () => this.svc.links().filter((l) => !l.category).length,
  );
  protected readonly uncategorizedLabel = UNCATEGORIZED;
  protected readonly siteCount = computed(
    () => this.svc.links().filter((l) => l.kind === 'site').length,
  );
  protected readonly focusCount = computed(
    () => this.svc.links().filter((l) => l.focusRank !== null).length,
  );

  async ngOnInit(): Promise<void> {
    await this.svc.init();
    await this.sync.init();
  }

  /** Tant que tout va bien rien ne s'affiche ; seuls les problèmes (hors ligne, reconnexion, erreur) apparaissent. */
  protected readonly problem = computed(() =>
    ['offline', 'auth-error', 'error'].includes(this.sync.status()),
  );

  /** Accès refusé : recharger la page fait réapparaître la demande d'identifiant du navigateur. */
  protected reconnect(): void {
    window.location.reload();
  }

  protected statusLabel(): string {
    switch (this.sync.status()) {
      case 'offline':
        return 'Hors ligne';
      case 'auth-error':
        return this.sync.gateway() ? 'Reconnexion requise' : 'Jeton refusé';
      default:
        return 'Erreur de mise à jour';
    }
  }
}

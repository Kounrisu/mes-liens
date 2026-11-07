import { Routes } from '@angular/router';
import { AdminPage } from './pages/admin';
import { CategoryPage } from './pages/category';
import { DetailPage } from './pages/detail';
import { EditPage } from './pages/edit';
import { FocusPage } from './pages/focus';
import { HomePage } from './pages/home';
import { SitesPage } from './pages/sites';
import { SourcesPage } from './pages/sources';
import { TablePage } from './pages/table';
import { YoutubePage } from './pages/youtube';
import { LibraryPage } from './pages/library';

export const routes: Routes = [
  {
    path: 'connections',
    loadComponent: () => import('./pages/connections').then((m) => m.ConnectionsPage),
    title: 'Import depuis mes comptes — mes-liens',
  },
  { path: 'sources', component: SourcesPage, title: 'Sources — mes-liens' },
  { path: 'sources/:name', loadComponent: () => import('./pages/source').then((m) => m.SourcePage), title: 'Source — mes-liens' },
  { path: 'library', component: LibraryPage, title: 'Bibliothèque — mes-liens' },
  { path: '', component: HomePage, title: 'mes-liens' },
  { path: 'admin', component: AdminPage, title: 'Administration — mes-liens' },
  { path: 'focus', component: FocusPage, title: 'Focus — mes-liens' },
  { path: 'sites', component: SitesPage, title: 'Sites — mes-liens' },
  { path: 'table', component: TablePage, title: 'Tableau — mes-liens' },
  { path: 'youtube', component: YoutubePage, title: 'YouTube — mes-liens' },
  { path: 'category/:name', component: CategoryPage, title: 'Catégorie — mes-liens' },
  { path: 'link/:id', component: DetailPage, title: 'Détail — mes-liens' },
  { path: 'link/:id/edit', component: EditPage, title: 'Modifier — mes-liens' },
  { path: '**', redirectTo: '' },
];

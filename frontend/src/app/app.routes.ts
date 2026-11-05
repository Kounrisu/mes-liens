import { Routes } from '@angular/router';
import { CategoryPage } from './pages/category';
import { DetailPage } from './pages/detail';
import { EditPage } from './pages/edit';
import { FocusPage } from './pages/focus';
import { HomePage } from './pages/home';
import { SitesPage } from './pages/sites';
import { TablePage } from './pages/table';
import { YoutubePage } from './pages/youtube';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'mes-liens' },
  { path: 'focus', component: FocusPage, title: 'Focus — mes-liens' },
  { path: 'sites', component: SitesPage, title: 'Sites — mes-liens' },
  { path: 'table', component: TablePage, title: 'Tableau — mes-liens' },
  { path: 'youtube', component: YoutubePage, title: 'YouTube — mes-liens' },
  { path: 'category/:name', component: CategoryPage, title: 'Catégorie — mes-liens' },
  { path: 'link/:id', component: DetailPage, title: 'Détail — mes-liens' },
  { path: 'link/:id/edit', component: EditPage, title: 'Modifier — mes-liens' },
  { path: '**', redirectTo: '' },
];

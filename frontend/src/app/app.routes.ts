import { Routes } from '@angular/router';
import { CategoryPage } from './pages/category';
import { DetailPage } from './pages/detail';
import { EditPage } from './pages/edit';
import { HomePage } from './pages/home';
import { TablePage } from './pages/table';
import { YoutubePage } from './pages/youtube';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'mes-liens' },
  { path: 'table', component: TablePage, title: 'Tableau — mes-liens' },
  { path: 'youtube', component: YoutubePage, title: 'YouTube — mes-liens' },
  { path: 'category/:name', component: CategoryPage, title: 'Catégorie — mes-liens' },
  { path: 'link/:id', component: DetailPage, title: 'Détail — mes-liens' },
  { path: 'link/:id/edit', component: EditPage, title: 'Modifier — mes-liens' },
  { path: '**', redirectTo: '' },
];

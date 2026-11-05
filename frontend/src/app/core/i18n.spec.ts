import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  I18nService,
  CategoryLabelPipe,
  LocalDatePipe,
  TranslatePipe,
  translateText,
} from './i18n';
import messages from './translations.en.json';

beforeEach(() => {
  localStorage.clear();
  TestBed.resetTestingModule();
});
describe('French and English interface', () => {
  it('updates existing controls and document language immediately and persists the choice', () => {
    const i18n = TestBed.inject(I18nService);
    const pipe = TestBed.runInInjectionContext(() => new TranslatePipe());
    expect(pipe.transform('Enregistrer')).toBe('Enregistrer');
    i18n.setLanguage('en');
    TestBed.tick();
    expect(pipe.transform('Enregistrer')).toBe('Save');
    expect(document.documentElement.lang).toBe('en');
    TestBed.resetTestingModule();
    expect(TestBed.inject(I18nService).language()).toBe('en');
    TestBed.inject(I18nService).setLanguage('invalid');
    expect(TestBed.inject(I18nService).language()).toBe('en');
  });
  it('translates counts, contextual errors and confirmations without replacing user values', () => {
    expect(translateText('en', 'Tout sélectionner ({0})', [125])).toBe('Select all (125)');
    expect(translateText('en', '125 lien(s) mis à jour.')).toBe('125 link(s) updated.');
    expect(translateText('en', 'Supprimer « Mes notes {0} » ?')).toBe('Delete “Mes notes {0}”?');
    expect(translateText('fr', 'Supprimer « Mes notes {0} » ?')).toBe(
      'Supprimer « Mes notes {0} » ?',
    );
    expect(translateText('en', 'Un titre personnel')).toBe('Un titre personnel');
    expect(translateText('en', 'constructor')).toBe('constructor');
    expect(translateText('en', 'Nom de la source')).toBe('Source name');
  });
  it('translates built-in category labels without changing custom names or their stored values', () => {
    TestBed.inject(I18nService).setLanguage('en');
    const pipe = TestBed.runInInjectionContext(() => new CategoryLabelPipe());
    expect(pipe.transform('formation / Mes notes')).toBe('learning / Mes notes');
    expect(pipe.transform('Mes notes')).toBe('Mes notes');
  });
  it('formats dates in the selected language', () => {
    const i18n = TestBed.inject(I18nService);
    const date = TestBed.runInInjectionContext(() => new LocalDatePipe());
    expect(date.transform('2026-04-15T12:00:00Z')).toContain('avr.');
    i18n.setLanguage('en');
    expect(date.transform('2026-04-15T12:00:00Z')).toContain('Apr');
  });
  it('has an English translation for every learning and navigation state', () => {
    for (const key of [
      'À trier',
      'À revoir',
      'À vérifier',
      'En cours',
      'Terminé',
      'Formation',
      'Vidéo',
      'Connaissances',
      '★ Favoris',
      'Tableau',
      'Sources et sites',
    ]) {
      expect(messages).toHaveProperty(key);
      expect(translateText('en', key)).not.toBe(key);
    }
  });
});

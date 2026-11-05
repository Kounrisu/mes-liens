import { DOCUMENT, Injectable, Pipe, PipeTransform, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import english from './translations.en.json';

export type Language = 'fr' | 'en';
const messages: Record<string, string> = english;
const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
const fill = (text: string, args: readonly unknown[]) =>
  text.replace(/\{(\d+)\}/g, (token, i) =>
    args[Number(i)] === undefined ? token : String(args[Number(i)]),
  );
// Service errors contain contextual values. Match only explicit catalogue messages, never translate user data.
const patterns = Object.entries(messages)
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort(([a], [b]) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => {
    const ids: number[] = [];
    const expression = key
      .split(/(\{\d+\})/)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          ids.push(Number(part.slice(1, -1)));
          return '(.*?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { regex: new RegExp('^' + expression + '$'), ids, value };
  });

export function translateText(
  language: Language,
  text: string,
  args: readonly unknown[] = [],
): string {
  if (language === 'fr') return fill(text, args);
  const key = normalize(text);
  if (Object.hasOwn(messages, key)) return fill(messages[key], args);
  for (const pattern of patterns) {
    const match = pattern.regex.exec(key);
    if (match) {
      const values: string[] = [];
      pattern.ids.forEach((id, index) => (values[id] = match[index + 1]));
      return fill(pattern.value, values);
    }
  }
  return fill(text, args);
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  readonly language = signal<Language>(this.initial());
  constructor() {
    effect(() => (this.document.documentElement.lang = this.language()));
  }
  private initial(): Language {
    try {
      return localStorage.getItem('mesliens.language') === 'en' ? 'en' : 'fr';
    } catch {
      return 'fr';
    }
  }
  setLanguage(value: string): void {
    if (value !== 'fr' && value !== 'en') return;
    this.language.set(value);
    try {
      localStorage.setItem('mesliens.language', value);
    } catch {
      /* Still works in memory. */
    }
  }
  t(text: unknown, args: readonly unknown[] = []): string {
    return translateText(this.language(), String(text ?? ''), args);
  }
}

@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(text: unknown, args: readonly unknown[] = []): string {
    return this.i18n.t(text, args);
  }
}

/** Translate built-in category labels for display only; stored values and custom names stay intact. */
@Pipe({ name: 'categoryLabel', pure: false })
export class CategoryLabelPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: string): string {
    const labels: Record<string, [string, string]> = {
      formation: ['formation', 'learning'],
      typescript: ['TypeScript', 'TypeScript'],
      angular: ['Angular', 'Angular'],
      java: ['Java', 'Java'],
      javascript: ['JavaScript', 'JavaScript'],
      figma: ['Figma', 'Figma'],
      web: ['Web', 'Web'],
      react: ['React', 'React'],
      css: ['CSS', 'CSS'],
      security: ['sécurité', 'security'],
      devops: ['DevOps', 'DevOps'],
      utile: ['utile', 'useful'],
      emploi: ['emploi', 'jobs'],
      veille: ['veille', 'research'],
      autre: ['autre', 'other'],
      'non classé': ['non classé', 'uncategorized'],
      music: ['musique', 'music'],
      'korean bands': ['groupes coréens', 'Korean bands'],
      'korean learning': ['apprendre le coréen', 'learning Korean'],
      'japanese learning': ['apprendre le japonais', 'learning Japanese'],
      'japanese bands': ['groupes japonais', 'Japanese bands'],
    };
    return value
      .split(' / ')
      .map((part) => labels[part]?.[this.i18n.language() === 'fr' ? 0 : 1] ?? part)
      .join(' / ');
  }
}

@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: string | number | Date | null | undefined, format = ''): string {
    if (value == null) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat(this.i18n.language() === 'fr' ? 'fr-FR' : 'en-GB', {
      dateStyle: 'medium',
      ...(format.includes('HH')
        ? { timeStyle: format.includes('ss') ? ('medium' as const) : ('short' as const) }
        : {}),
    }).format(date);
  }
}

@Injectable()
export class LocalizedTitleStrategy extends TitleStrategy {
  private readonly i18n = inject(I18nService);
  private readonly title = inject(Title);
  private readonly current = signal('mes-liens');
  constructor() {
    super();
    effect(() => this.title.setTitle(this.i18n.t(this.current())));
  }
  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.current.set(this.buildTitle(snapshot) ?? 'mes-liens');
  }
}

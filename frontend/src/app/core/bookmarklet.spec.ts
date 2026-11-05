import { describe, expect, it } from 'vitest';
import { buildBookmarklet, shortcutBase } from './bookmarklet';

describe('bookmarklet', () => {
  it('commence par javascript:, vise l’origine donnée et encode adresse et titre', () => {
    const b = buildBookmarklet('https://links.sn8w.com');
    expect(b.startsWith('javascript:(function(){')).toBe(true);
    expect(b).toContain('"https://links.sn8w.com/?url="');
    expect(b).toContain('encodeURIComponent(location.href)');
    expect(b).toContain('encodeURIComponent(document.title)');
    expect(b).not.toMatch(/\n/);
  });

  it('s’exécute réellement : ouvre la bonne adresse avec les paramètres encodés', () => {
    const opened: string[] = [];
    const code = buildBookmarklet('https://links.sn8w.com').replace(/^javascript:/, '');
    new Function('window', 'location', 'document', `return ${code}`)(
      { open: (u: string) => opened.push(u) },
      { href: 'https://e.org/a?b=1&c=é#x' },
      { title: 'Titre & "test"' },
    );
    const u = new URL(opened[0]);
    expect(u.origin).toBe('https://links.sn8w.com');
    expect(u.searchParams.get('url')).toBe('https://e.org/a?b=1&c=é#x');
    expect(u.searchParams.get('title')).toBe('Titre & "test"');
  });

  it('une origine piégée ne peut pas sortir de la chaîne JSON', () => {
    const b = buildBookmarklet('https://x.org"+alert(1)+"');
    const opened: string[] = [];
    const code = b.replace(/^javascript:/, '');
    new Function('window', 'location', 'document', `return ${code}`)({ open: (u: string) => opened.push(u) }, { href: 'https://e.org' }, { title: 't' });
    expect(opened).toHaveLength(1); // alert n'a pas été exécuté (il aurait levé ReferenceError)
  });

  it('shortcutBase', () => {
    expect(shortcutBase('https://links.sn8w.com')).toBe('https://links.sn8w.com/?url=');
  });
});

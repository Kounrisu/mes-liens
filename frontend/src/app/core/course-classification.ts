import { detectSource, normalizeCategory } from './catalog';
import { libraryOf, categoryWithin } from './library';
import { Link } from './models';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const topics: [string, RegExp][] = [
  ['fullstack', /\bfull[\s-]?stack\b/],
  ['angular', /\bangular(?:js)?\b/],
  ['typescript', /\btypescript\b/],
  ['java', /\bjava\b|\bspring(?:boot|\s+boot)?\b/],
  ['devops', /\bdevops\b|\bdocker\b|\bkubernetes\b|\bterraform\b|\bansible\b|\bci[\s/-]+cd\b/],
  ['security', /\bsecurity\b|\bsecurite\b|\bcybersecurity\b|\bowasp\b|\bpentest\b/],
  ['javascript', /\bjavascript\b|\becmascript\b/],
  ['react', /\breact(?:js)?\b/],
  ['css', /\bcss\b|\btailwind\b/],
  ['figma', /\bfigma\b/],
];
export function courseSuggestion(
  link: Pick<Link, 'url' | 'title' | 'tags' | 'category' | 'kind' | 'deletedAt' | 'library'>,
): string | null {
  if (link.deletedAt || link.kind === 'site' || libraryOf(link).archived) return null;
  const category = normalizeCategory(link.category);
  // Preserve an existing precise classification, even when other topics appear in the title.
  if (category.startsWith('formation / ')) return category;
  let pathname = '';
  try {
    pathname = decodeURIComponent(new URL(link.url).pathname);
  } catch {}
  const text = fold(`${link.title} ${link.tags.join(' ')} ${pathname}`);
  const learning =
    categoryWithin(category, 'formation') ||
    libraryOf(link).resourceType === 'course' ||
    detectSource(link.url)?.category === 'formation' ||
    /\b(course|courses|cours|formation|tutorial|tutorials|tutoriel|bootcamp|masterclass|learn|apprendre)\b/.test(
      text,
    );
  if (!learning) return null;
  const topic = topics.find(([, pattern]) => pattern.test(text))?.[0];
  return topic ? `formation / ${topic}` : 'formation';
}
export interface CourseChange {
  before: Link;
  category: string;
  source: string;
}
export function planCourseClassification(links: readonly Link[]): CourseChange[] {
  return links.flatMap((before) => {
    const category = courseSuggestion(before);
    if (!category) return [];
    const source = before.source.trim() || detectSource(before.url)?.source || '';
    return before.category === category &&
      libraryOf(before).resourceType === 'course' &&
      before.source === source
      ? []
      : [{ before, category, source }];
  });
}

/**
 * Bookmarklet : un favori « javascript: » qui, depuis n'importe quelle page, ouvre mes-liens avec l'adresse et le titre déjà remplis
 * (le formulaire de l'accueil lit ?url=…&title=…). L'origine est celle de l'application elle-même, insérée comme chaîne JSON.
 */
export function buildBookmarklet(origin: string): string {
  const base = JSON.stringify(`${origin}/?url=`);
  return `javascript:(function(){window.open(${base}+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;
}

/** Début d'adresse pour le Raccourci iOS : on lui ajoute l'adresse de la page, encodée. */
export function shortcutBase(origin: string): string {
  return `${origin}/?url=`;
}

# Sources et langues — v0.3.0

## Utilisation

- « Source / site de rattachement » propose les sources déjà utilisées et les fiches de sites dans une seule liste. Une source saisie dans le formulaire apparaît immédiatement et est conservée lors de l'enregistrement du lien.
- La navigation « Sources » ouvre la gestion du catalogue : ajout d'une source avec son adresse de site, modification du nom et de l'adresse, suppression avec confirmation. Une source existante sans fiche de site peut être renommée sans inventer d'adresse.
- Le renommage met à jour les libellés correspondants, y compris dans les archives. La suppression retire le libellé et les rattachements concernés et supprime logiquement la fiche du site ; les liens enfants, leurs notes, étiquettes et données d'apprentissage sont conservés. Ces changements suivent la synchronisation et les sauvegardes existantes.
- Tableau et YouTube affichent leur nombre de liens actifs dans la navigation, avec la même définition que leurs pages (archives exclues).
- Le sélecteur Français / English se trouve dans l'en-tête. Le choix est mémorisé sur l'appareil. Les textes de l'interface, libellés accessibles, messages, confirmations, titres de page et dates changent immédiatement. Les catégories prédéfinies ont des libellés traduits sans modifier leur valeur stockée. Les titres, notes et catégories personnalisées restent inchangés.

## Validation

- Build Angular de production : 483 ko bruts, environ 124 ko transférés.
- 141 tests frontend réussis ; 2 tests préexistants ignorés. Régressions couvertes : anciennes sources, ajout, renommage, suppression sans perte des enfants, synchronisation des modifications, compteurs hors archives, changement de langue, conservation des paramètres et affichage des dates.
- `npm run check:i18n` vérifie les clés littérales des 22 templates Angular contre le catalogue anglais.
- Playwright : parcours en français et anglais, création et renommage de sources, suppression avec confirmation traduite, conservation des liens, compteurs, actions en lot, persistance après rechargement, formulaires conservés après changement de langue et largeur mobile de 390 px.
- Revue 21st des contrôles modifiés : aucune anomalie. Composants et styles Angular du projet réutilisés ; recherche du catalogue 21st indisponible.

## Livraison

Cette version modifie uniquement le frontend ; aucune migration de base ni mise à jour de l'API n'est nécessaire. `infra/deploy-bilingual-release.sh` sauvegarde le serveur et l'ancien frontend, conserve les anciens fichiers hachés des PWA et vérifie les routes et l'authentification. `infra/verify-bilingual-release.py` compare tous les fichiers déployés et effectue des contrôles API en lecture seule, sans afficher de données personnelles.

Déployé le 5 novembre 2026 à 20 h 32 (Paris) sur https://links.sn8w.com. Sauvegarde `2026-11-05-1932`, copie de restauration du frontend dans `releases/bilingual-v1/rollback`. Tous les fichiers déployés correspondent au build testé. Contrôle API réussi ; les pages Sources, Bibliothèque, Tableau et YouTube ainsi que l'API exigent toujours une authentification. Tag local : `v0.3.0-sources-languages` ; aucun push Git.

# Journal

## 2026-11-05 — Création du dépôt
- Squelette créé : frontend/, backend/, infra/, docs/.
- Phase 0 (découverte VPS) à faire, aucun code.

## 2026-11-05 — Phase 1 (squelette, stockage, export/import)
- Versions vérifiées sur npm : Angular 22.2.x (CLI 22.2.6), TypeScript 6.0, Vitest 5 (test runner par défaut d'Angular 22). Node 22.22 et JDK 25 présents en local. Spring Boot / PostgreSQL : à vérifier en phase 2.
- Choix : couche stockage `LinkStore` sans dépendance Angular (lib `idb`), testée avec `fake-indexeddb`.
- Export JSON versionné (`format`, `version`) ; l'import valide tout AVANT d'écrire (un fichier invalide ne modifie pas la base). Modes `replace` (identique au fichier) et `merge` (le plus récent gagne par lien).
- Les tombstones (deletedAt) sont exportés et réimportés.
- Journal d'événements : `addEvent` refuse d'écraser un id existant ; seul `replaceAll` (restauration) supprime des événements.
- Tests : 10 passent (stockage, aller-retour export/vidage/import, fichiers invalides, merge).
- Non fait : UI, service worker/PWA (phase 5), gitleaks en CI. Pas de test navigateur réel d'IndexedDB (fake-indexeddb seulement).

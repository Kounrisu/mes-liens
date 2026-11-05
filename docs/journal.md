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

## 2026-11-05 — Phase 2 (API Spring Boot)
- Versions vérifiées (start.spring.io, Docker Hub) : Spring Boot 4.1.2 stable (4.2.0-RC1 existe, non retenue), PostgreSQL 18.6 stable (19 en RC), Java 25 LTS (installé en local ; défaut Initializr = 17). Maven wrapper.
- Endpoints : `GET/PUT/DELETE /api/links`, `GET/POST /api/events`, `PUT/GET /api/screenshots/{id}`.
- PUT lien = upsert, le plus récent gagne sur l'enregistrement entier ; à `updatedAt` égal le serveur garde sa version (rejeu idempotent). Un DELETE pose un tombstone. Une édition plus récente qu'un tombstone ressuscite le lien (choix : « le plus récent gagne », sans cas particulier pour la suppression).
- `events` : ajout seul garanti à 3 niveaux : pas de PUT/DELETE exposé, entité @Immutable, trigger PostgreSQL qui refuse UPDATE/DELETE (testé).
- Auth : en-tête `X-Api-Token`, comparaison en temps constant sur SHA-256. Démarrage refusé si jeton absent ou < 32 caractères. Limite de débit par IP (120/min) et limite d'échecs d'auth (10/min) → 429. HTTPS exigé (le TLS est terminé par le reverse proxy ; on vérifie `X-Forwarded-Proto`).
- Captures : fichiers disque nommés par UUID, type déterminé par signature (PNG/JPEG/WebP/GIF ; SVG exclu), 5 Mo max, écriture atomique, `nosniff` + CSP stricte en lecture.
- Tests : 17 passent (PostgreSQL 18 via Testcontainers + tests unitaires du filtre).
- Non fait / incertain : pas de CORS (prévu : même domaine via reverse proxy, à trancher en phase 0/5) ; limiteur en mémoire (remis à zéro au redémarrage) ; pas de nettoyage des captures orphelines ; pas de pagination de `GET /api/links` (OK pour quelques milliers de liens).

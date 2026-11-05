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

## 2026-11-05 — Phase 3 (PWA : enregistrer, coller, lister, rechercher, filtrer)
- UI Angular en signals, sans module Forms ni router. Tout est local (IndexedDB) ; la synchro vient en phase 4.
- Captures : collage (Ctrl/Cmd+V), glisser-déposer, ou sélecteur de fichier (utile sur iPhone/iPad où coller est peu pratique). Redimensionnées à 1600 px et recompressées en WebP côté client (une capture iPhone fait plusieurs Mo, le serveur limite à 5 Mo). Stockées en Blob dans un nouveau store IndexedDB `screenshots` (base passée en version 2, migration incrémentale).
- Sécurité : `normalizeUrl` n'accepte que http(s) — un `javascript:` collé finirait sinon dans un `href` (risque réel d'XSS, testé). Aucun `innerHTML` ; tout passe par l'interpolation Angular. Liens externes en `rel="noopener noreferrer"`.
- Recherche : tous les mots doivent correspondre (titre, url, note, étiquettes), insensible à la casse et aux accents. Filtre par étiquettes en ET.
- Le préremplissage `?url=…&title=…` est déjà géré (sert au bookmarklet / Raccourci iOS de la phase 5).
- Chaque enregistrement écrit déjà les événements `created` (et `screenshot_added`) ; la vue historique est en phase 6.
- Tests : 17 passent côté front (dont filtres, étiquettes, URL dangereuses). Vérifié à la main dans le navigateur : collage d'image simulé, enregistrement, affichage de la carte, étiquettes. Port 4200 déjà pris par un autre projet → dev sur 4300.
- Non fait / limites : l'export JSON ne contient PAS les captures (seulement `screenshotId`) ; pas d'édition d'un lien existant (seulement suppression) ; pas testé sur Safari iOS ; pas de service worker (phase 5).

## 2026-11-05 — Phase 4 (synchronisation bidirectionnelle)
- **Décision clé : curseur attribué par le serveur.** Un curseur « updatedAt > dernière synchro » perd silencieusement un lien créé hors ligne puis poussé après la synchro d'un autre appareil (testé : cas « vieille date »). Le serveur numérote chaque écriture (`server_seq`, séquence + trigger PostgreSQL, migration V2) ; `GET /api/sync?since=N` renvoie tout ce qui a un numéro > N, tombstones compris. Les horloges des appareils ne servent qu'à départager un conflit (le plus récent gagne, enregistrement entier ; égalité = le serveur garde sa version et les clients s'alignent dessus).
- Côté client : chaque écriture locale marque l'élément « à pousser » dans la MÊME transaction IndexedDB (impossible d'avoir un changement sans marque). Une marque n'est effacée que si l'élément n'a pas été modifié pendant l'envoi (compteur `n`). Ordre de poussée : captures, liens, événements. Tout est idempotent : une coupure à n'importe quel moment est rattrapée à la synchro suivante.
- Dates : le serveur renvoie des précisions variables (`…00Z`, `…00.5Z`, µs) ; comparées en chaînes elles seraient mal ordonnées. Normalisation ISO-ms à la réception (testé).
- Serveur réinitialisé (curseur client > head serveur) : le client repart de 0 et repousse tout.
- Sécurité : le client refuse une URL de serveur en http:// (sauf localhost) pour que le jeton ne circule jamais en clair. CORS désactivé par défaut (même origine) ; sinon liste blanche explicite, jamais `*`, le filtre CORS passe avant le contrôle du jeton (le preflight OPTIONS n'a pas de jeton). Le jeton est stocké dans IndexedDB de l'appareil : risque réel limité (il faudrait un XSS pour le lire, aucune injection HTML dans l'app), à connaître.
- Bug trouvé par le test de bout en bout réel : les données écrites avant la synchro (base v2) n'étaient pas marquées à pousser après la migration → jamais envoyées. Corrigé (la migration marque tout) + test.
- Tests : API 23 (dont curseur, tombstones, CORS) ; front 42 (19 scénarios de synchro avec faux serveur : hors ligne, conflits dans les deux ordres, égalité, suppression vs édition dans les deux sens, coupure en cours de poussée, modification pendant l'envoi, élément refusé, jeton refusé, serveur réinitialisé, événements anciens, captures). + 1 test de bout en bout contre la vraie API (PostgreSQL 18 en Docker), ignoré par défaut : `SYNC_E2E_URL=http://localhost:8080 SYNC_E2E_TOKEN=… npx ng test --watch=false`. Vérifié aussi depuis le navigateur (CORS réel localhost:4300 → :8080).
- Non fait / risques assumés : fenêtre de course théorique du curseur (une transaction serveur de numéro N pourrait être validée après la lecture de N+1 ; improbable avec un seul utilisateur, aucune protection) ; la synchro est un « pull complet depuis le curseur » sans pagination ; les captures ne sont pas supprimées du disque à la suppression d'un lien ; pas de synchro en arrière-plan quand l'app est fermée (limitation iOS/PWA : seulement à l'ouverture, au retour du réseau et toutes les 60 s si visible).

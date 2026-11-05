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

## 2026-11-05 — Catégories, sources, pages et tableau (demande en cours de phase 4)
- Demande : catégories (formation, manga, anime, utile…), source (Udemy, Academind, Frontend Masters…), pages par catégorie, tableau global triable, modification complète / suppression / ouverture du lien.
- **Modèle** : `Link` gagne `category` (une seule par lien, texte libre normalisé en minuscules ; 7 proposées d'office : formation, manga, anime, utile, emploi, veille, autre) et `source`. Les étiquettes restent libres et à plat. API : migration V3 (colonnes `NOT NULL DEFAULT ''`, n'active pas le trigger de curseur sur l'existant) ; le DTO tolère l'absence des champs (ancien client = chaîne vide). Export/import : champs optionnels (anciens exports valides).
- **Détection de la source** depuis le domaine (sous-domaines compris, `notudemy.com` / `udemy.com.evil.example` rejetés, testé) : Udemy, Academind, Frontend Masters, Coursera, egghead, Pluralsight, OpenClassrooms, Ultimate Courses, Scrimba, edX, Udacity + Crunchyroll, AniList, MyAnimeList (anime), MangaDex (manga). Elle propose source + catégorie tant que tu n'y as pas touché ; ta saisie l'emporte toujours. **À trancher : « master.dev »** — je n'ai pas pu confirmer à quel site correspond ce domaine, je ne l'ai donc pas inventé ; dis-moi lequel c'est (ou ajoute-le dans `core/catalog.ts`).
- **Pages** (routeur Angular) : `/` accueil (formulaire + liste), `/category/:name` (une page par catégorie, `_` = non classé), `/table` (tableau global, tri sur titre/source/catégorie/créé/modifié avec `aria-sort`, vides toujours en dernier, recherche, filtre catégorie), `/link/:id/edit` (modification de TOUS les champs, remplacement/retrait de la capture, ouvrir, supprimer). Un seul formulaire sert à créer et à modifier.
- Modifier un lien remplace l'enregistrement entier avec `updatedAt` = maintenant (donc « le plus récent gagne » pour la synchro) et écrit au journal : `tagged`, `untagged`, `note_edited`, `screenshot_added` (utile pour la vue historique de la phase 6).
- **Bugs trouvés en vérifiant dans le navigateur** : (1) `withComponentInputBinding` lie `undefined` (pas `''`) quand le paramètre d'URL est absent → le tableau ne montrait que 2 liens sur 6 ; (2) les liens créés avant les catégories n'ont pas le champ dans IndexedDB → complétés à la lecture (`withDefaults`), testé avec une vraie base v2.
- **Infra à prévoir** : le routage par chemins (`/table`, `/category/…`) exige que le reverse proxy renvoie `index.html` pour tout chemin inconnu (fallback SPA), sinon un rechargement de page donne une 404. Le bookmarklet ouvrira `/?url=…&title=…`.
- Tests : API 24 ; front 58 (+1 test de bout en bout ignoré par défaut). Vérifié dans le navigateur : détection automatique, tri, modification, navigation, propagation de la modification jusqu'à l'API.
- Non fait : renommage/fusion de catégories en masse ; pas de pagination du tableau ; pas testé sur Safari iOS.

## 2026-11-05 — Fiche d'un lien
- « Ouvrir » (tableau et cartes) ouvre maintenant la fiche du lien (`/link/:id`) : adresse, source, catégorie, étiquettes, note, capture, dates et historique des événements. Le site s'ouvre depuis « Aller au site » (nouvel onglet, `noopener noreferrer`). Le titre cliquable du tableau et des cartes ouvre toujours le site.
- Vérifié dans le navigateur. L'historique affiché est celui du journal d'événements ; la vue historique chronologique globale reste la phase 6.

## 2026-11-05 — Page YouTube
- Nouvelle page `/youtube` : les liens dont l'adresse est YouTube (`youtube.com`, sous-domaines dont `music.`, `m.`, et `youtu.be`) rangés en 6 sections — formation, music, korean bands, korean learning, japanese learning, japanese bands — toujours toutes affichées (même vides, avec un message), plus « Autres vidéos YouTube » (non classées ou catégorie hors liste). Recherche, raccourcis vers les sections, chaque titre de section mène à `/category/<nom>`.
- Ce sont de simples catégories (texte libre) : aucune migration, elles sont proposées dans le formulaire et ont aussi leur page de catégorie. Les liens YouTube reçoivent automatiquement la source « YouTube » mais PAS de catégorie (une vidéo peut être de la formation comme de la musique) : à choisir à la création ou en modifiant.
- Le critère « YouTube » se base sur l'URL, pas sur la source saisie (testé : `notyoutube.com`, `youtube.com.evil.example` rejetés).
- Limite : une vidéo ne peut avoir qu'une catégorie. Une vidéo « music » + « korean bands » doit choisir l'une des deux (les étiquettes libres, elles, sont multiples).
- Tests : 61 (front).

## 2026-11-05 — Page Focus (tableau de bord des favoris à apprendre)
- Demande : une page « focus » façon dashboard avec des liens favoris à apprendre, avec des rangs. Interprétation retenue : une liste ORDONNÉE (rang 1 = priorité n°1) que tu composes avec le bouton « ☆ Focus » (cartes, tableau, fiche) et réordonnes avec « Monter / Descendre ». Dis-moi si tu pensais à autre chose (ex. niveaux de maîtrise, progression, échéances).
- Modèle : `Link.focusRank` (entier ≥ 1, `null` = hors focus). API : migration V4 (colonne nullable, validation 1..100000). Anciens clients / exports / liens locaux sans le champ : `null`.
- **Point délicat — rangs en double.** Deux appareils hors ligne peuvent tous deux ajouter un favori en « dernière position » → deux liens au même rang. L'ordre d'affichage est donc un ordre total (rang, puis date de création, puis id) identique sur tous les appareils ; la position affichée est l'index + 1, pas la valeur brute. Chaque action (ajouter, retirer, monter, descendre) renumérote 1..n et n'écrit que les liens dont le rang change (logique pure testée : `core/focus.ts`).
- Chaque lien dont le rang change est remplacé en entier avec un `updatedAt` strictement plus récent (garde-fou : deux changements dans la même milliseconde n'ont jamais la même date) et marqué à pousser. Conséquence à connaître : réordonner le focus « touche » plusieurs liens, et si deux appareils réordonnent en même temps hors ligne, le plus récent gagne lien par lien — le classement peut alors être un mélange ; il reste valide (renuméroté au prochain mouvement).
- Le tableau de bord montre : nombre en focus, total, ajoutés cette semaine, principales catégories (cliquables), puis le classement, puis 6 suggestions (derniers liens hors focus) avec bouton ☆.
- Pas d'événement de journal pour le focus (les 6 types du cahier des charges sont inchangés).
- Tests : API 25 ; front 76. Vérifié dans le navigateur : mise en focus depuis le tableau, classement, descente d'un rang, compteur dans le menu.

## 2026-11-05 — Sites (plateformes) et liens rattachés
- Besoin : enregistrer un site de formation (youtube.com, app.ultimatecourses.com…) puis y rattacher des liens plus précis vers ses formations.
- **Choix de modèle** : pas de nouvelle entité. Un site est un `Link` avec `kind = 'site'` ; un lien s'y rattache via `parentId`. Un seul niveau (site → liens). Avantage : tout le reste (synchro « le plus récent gagne », export/import, tombstones, focus, catégories, capture d'écran) fonctionne sans code supplémentaire. API : migration V5 (`kind` avec CHECK, `parent_id`, sans clé étrangère). Anciens clients / exports / liens locaux : `link` / `null`.
- **Pas de clé étrangère, volontairement** : en synchronisation, un lien peut arriver avant son site, ou son site peut être supprimé sur un autre appareil. L'affichage est donc tolérant (`siteOf` : parent absent, supprimé ou plus un site → le lien s'affiche sans site, jamais d'erreur). Supprimer un site ne supprime pas ses liens (la fiche le dit avant confirmation).
- **Règles vérifiées côté client** (`checkHierarchy`, avant toute écriture) : pas son propre parent, un site n'a pas de parent, le parent doit exister et être un site, un site qui a des liens ne redevient pas un lien ordinaire. L'API n'applique que « pas son propre parent » et la valeur de `kind` : elle ne peut pas contrôler le reste sans bloquer la synchro (ordre d'arrivée aléatoire).
- **Confort** : en saisissant une adresse, le site déjà enregistré qui correspond (même domaine, `www.` et sous-domaines compris, le plus précis gagne ; `notyoutube.com` ne correspond pas à `youtube.com`) est proposé ; catégorie et source du site sont reprises tant que tu n'y touches pas. Le bouton « + Ajouter un lien à ce site » ouvre le formulaire avec le site et son adresse préremplis.
- **Pages** : `/sites` (liste des plateformes avec leurs liens), fiche d'un site (liste de ses liens + ajout), fiche d'un lien (affiche son site). Badge « site » dans les cartes et le tableau.
- Bug trouvé par les tests : à égalité de longueur, un site « sous-domaine » battait le site exact dans la suggestion → priorité à la correspondance exacte.
- À savoir : `source` (texte) reste indépendant du site parent : modifier le titre d'un site ne met pas à jour la `source` des liens déjà enregistrés.
- Tests : API 26 ; front 91.

## 2026-11-05 — Import des favoris du navigateur (préparé par IA) + passage à l'échelle
- Besoin : importer ~2 700 / 3 700 favoris (deux exports du même navigateur, presque identiques : 64 liens de différence). L'IA prépare le fichier au format d'export de l'app (v1) ; l'import passe par le bouton « Importer » existant, donc par le même validateur que n'importe quel fichier.
- **Données personnelles** : les favoris sont dans `imports/` (exclu de git via `.gitignore`, dépôt public). Jamais commités. Le journal ne contient que des comptes, pas de contenu.
- **Règles d'exclusion validées (défauts)** : schémas autres que http(s), localhost/IP privées, pages de résultats Google, Facebook, dossiers `0-missions` (travail clients, URL d'admin) et `Kampf`, URL portant `token=`/`password=`/`apikey=`. Doublons (même URL sans ancre ni slash final) fusionnés. Résultat : 1 700 liens + 5 sites, 1 705 événements `created`, dates d'ajout d'origine conservées.
- **Classement** : le nom du dossier ne suffit pas (le dossier « Manga / Job » contient des offres d'emploi, « Stuff / Trucs » est un fourre-tout). Règles dans l'ordre : domaine (plateformes de formation, anime, sites d'emploi), mots « job/emploi » dans le chemin, puis dossier racine (languages → japanese/korean learning ou formation, Media → manga/music/veille/autre, web-code/accessibility → formation, outils/webdesign → utile, Perso → autre). Étiquettes = noms de dossiers nettoyés + `import-favoris` (pour retrouver / supprimer tout l'import d'un coup). 617 liens restent en `autre` : à trier.
- **Passage à l'échelle** (problèmes révélés par ce volume) :
  1. Envoi par lots : `POST /api/sync/links` et `/api/sync/events` (500 max par requête, atomiques, idempotents, même règle « le plus récent gagne »). Le client envoie par lots de 200 ; si un lot est refusé, il rejoue élément par élément pour isoler le fautif. 1 000 liens + 1 000 événements = 10 requêtes au lieu de 2 000 (la limite de débit est de 120/min). Les anciens `PUT /api/links/{id}` et `POST /api/events` restent disponibles.
  2. Pagination « Afficher plus » (48 cartes / 100 lignes), remise à zéro quand les filtres changent.
- **Non vérifié** : aucune importation réelle dans le navigateur avec 1 700 liens (validé avec fake-indexeddb seulement) ; performance d'affichage et de la première synchro à confirmer à l'usage. Le serveur déployé devra être mis à jour avec les nouveaux endpoints avant la première synchro (rien n'est déployé pour l'instant).
- Tests : API 29 ; front 94 (+ e2e et validation de fichier d'import, ignorés par défaut : `IMPORT_FILE=imports/mes-liens-import.json npx ng test --watch=false`).

## 2026-11-05 — Phase 0 : état des lieux du VPS (lecture seule)
- L'accès (hôte, utilisateur) n'était pas dans la config SSH : retrouvé dans les runbooks de tes autres projets (`C:\dev\learning`, `07-my_server…`, `23-nesto/docs`), puis vérifié par connexion SSH par clé. Deux scripts en lecture seule (système, mémoire, disque, Docker, conteneurs, réseaux, volumes, ports, pare-feu, Caddyfile, certificats, mémoire par conteneur, sauvegardes). Aucun fichier de secrets lu (`.env`, compose de prod), rien modifié, rien déployé.
- Rapport complet et plan : `docs/decisions/0001-deploiement-vps.md`.
- Faits marquants : Caddy partagé + un PostgreSQL 16 par application en conteneur ; 1,6 Go de RAM disponibles sans swap ; disque à 80 % ; **aucune sauvegarde automatique** ; pas de DNS générique (enregistrement A à créer chez OVH).
- Décision proposée : conteneurs dédiés (PostgreSQL 18, API, serveur statique), un seul bloc ajouté au Caddyfile + `caddy reload` (sans coupure), builds sur le PC, secrets générés sur le VPS.
- Non vérifié : image Java 25 disponible ; mises à jour automatiques du système.

## 2026-11-05 — Déploiement : sous-domaine choisi, fichiers `infra/` prêts (rien déployé)
- **Décision** : `links.sn8w.com` (corrigé : j'avais d'abord compris « liens »). DNS pas encore créé (vérifié : aucun enregistrement).
- Images vérifiées sur Docker Hub : `eclipse-temurin:25-jre-alpine` (72 Mo), `postgres:18-alpine`, `caddy:2-alpine` → Java 25 conservé, pas de repli sur 21.
- `infra/` : compose de prod (3 conteneurs, réseau privé pour la base, aucun port publié, volumes nommés, limites mémoire, JVM bornée à 256 Mo), Dockerfile API (utilisateur non-root, JRE seul), Caddyfile statique interne (repli SPA, `no-cache` pour le futur service worker), bloc à ajouter au Caddy du serveur (HSTS, limite de corps 8 Mo), `backup.sh`, `.env.prod.example` (sans valeurs), `README.md` (procédure pas à pas : ce que chaque commande modifie et comment annuler).
- **Répétition générale en local** avec de faux secrets (même compose, mêmes images) : PostgreSQL 18.6, 5 migrations appliquées, API healthy en 6 s, repli SPA 200, sans jeton 401, http clair 403, bon jeton OK, base injoignable depuis le conteneur web, volume captures écrivable en non-root, `POST /api/sync/links` OK, `backup.sh` OK et **restauration vérifiée** (lien restauré dans une base vierge), mémoire ≈ 300 Mo. Tout nettoyé ensuite (conteneurs, volumes, réseau local).
- Bug évité en passant : `.gitignore` masquait `.env.prod.example` (règle `.env.*`) → exception `!.env.*.example`.
- Sécurité : `MESLIENS_TRUST_XFF=true` est sûr uniquement parce que Caddy réécrit `X-Forwarded-*` ; si un autre proxy est un jour ajouté devant, à revoir (risque réel : contournement de la limite de débit).
- Non fait : DNS (à créer chez OVH), planification des sauvegardes (timer systemd, `crontab` absent du serveur), purge du cache Docker, première exécution sur le VPS.

## 2026-11-05 — Déploiement sur le VPS : https://links.sn8w.com (étapes 1 à 6, accord explicite)
- Pré-vérifications (lecture seule) : rien de `mes-liens` n'existait ; état de référence des 6 autres sites = 200. DNS `links.sn8w.com` créé par l'utilisateur chez OVH (vérifié chez Google et Cloudflare).
- Réalisé : builds sur le PC (jar 52 Mo, front 337 Ko) ; copie dans `~/mes-liens` (52 Mo, aucun CRLF) ; secrets générés SUR le serveur (`.env.prod`, mode 600, 48 et 64 caractères, jamais affichés) ; `docker compose up -d --build` → 3 conteneurs sains, PostgreSQL 18.6, 5 migrations ; bloc ajouté au Caddy partagé avec copie datée (`Caddyfile.bak-20261105114430`), `caddy validate` OK puis `caddy reload` gracieux.
- Vérifié depuis l'extérieur : PWA 200, `/table` 200 (repli SPA), API sans jeton 401, mauvais jeton 401, jeton valide via Caddy 200 (donc `X-Forwarded-Proto` bien pris en compte), HTTP → 308 vers HTTPS, certificat Let's Encrypt valide, HSTS / nosniff / referrer-policy présents, base non publiée sur l'hôte, les 6 autres sites toujours 200, tous les autres conteneurs toujours Up.
- Empreinte réelle : API 226 Mo, base 84 Mo, web 16 Mo ; disque 7,6 → 6,7 Go libres (83 %), RAM disponible 1,7 → 1,35 Go.
- Fausse alerte levée : une ligne de log contenant « Error » était l'option JVM `ExitOnOutOfMemoryError`.
- **Rien n'est encore dans la base de production** (0 lien). Le front en développement (localhost:4300) a ses propres données locales ; il ne peut pas synchroniser vers le serveur (pas de CORS, volontairement : en production la PWA et l'API ont la même origine).
- Reste à faire : (1) sauvegardes planifiées (`crontab` absent → timer systemd, sudo, sur accord) AVANT de mettre des données dans la base ; (2) purge du cache Docker (disque à 83 %) sur accord ; (3) première synchro / import dans la base de production ; (4) phase 5 (PWA installable, bookmarklet, Raccourci iOS), phase 6.
- Rollback documenté : restaurer la copie du Caddyfile + `caddy reload` ; `docker compose down` ; `rm -rf ~/mes-liens` (les volumes ne partent qu'avec `down -v`).

## 2026-11-05 — Sauvegardes quotidiennes installées sur le VPS (accord explicite)
- Installé : timer systemd `mesliens-backup.timer` (03:30 UTC ± 10 min, rattrapage si serveur éteint) + service en utilisateur `debian`, priorité basse ; script `~/mes-liens/backup.sh` ; dossier `~/mes-liens-backups` (700). Prochain déclenchement : 2026-11-06 03:36 UTC. Exécution réelle par systemd testée : OK.
- Restauration testée SUR LE SERVEUR dans une base jetable (3 tables, 5 migrations, trigger append-only présent), base jetable supprimée ensuite ; la base de production n'a jamais été écrite.
- **Erreurs commises et réparées (à relire)** :
  1. Mon test de restauration avait un bug de guillemets et a laissé une base jetable `restore_check` (supprimée aussitôt ; le script de test la nettoie maintenant via `trap`).
  2. **Régression sur la production** : au premier essai, le script montait le volume des captures sur `/data` d'une image qui déclare déjà `/data`. Docker a copié dans le volume vide le dossier `caddy/` ET le propriétaire `root` de l'image : le dossier des captures est passé de `app:app` à `root:root`, l'API ne pouvait plus écrire (« Permission denied » constaté). Aucune capture n'existait, donc aucune perte. Réparé (`rmdir caddy` — dossier vide créé par moi —, `chown app:app`), cause corrigée (montage sur `/vol`), et le test de sauvegarde vérifie désormais que l'API peut écrire avant ET après. La répétition locale n'avait pas détecté cela (Docker Desktop, volume déjà rempli).
  3. L'archive des captures était d'abord créée en `root` : le conteneur de sauvegarde reste root (l'API écrit ses captures en mode 600 via un fichier temporaire, un utilisateur ordinaire ne pourrait pas les lire) mais rend l'archive à `debian` en 600.
- Les fichiers des essais manuels (créés par moi) ont été supprimés.
- Non fait : copie hors serveur des sauvegardes ; purge du cache Docker (disque 83 %) ; chargement des données dans la base de production.

## 2026-11-05 — Base de production chargée avec les favoris importés (accord explicite)
- Constat de l'utilisateur : « rien dans l'app » sur links.sn8w.com. Normal à ce moment-là : base de production vide, et le navigateur n'a pas de copie locale pour cette origine (IndexedDB est propre à chaque origine : localhost:4300 ≠ links.sn8w.com).
- Procédé : lots (200 par requête, 9 de liens + 9 d'événements) préparés sur le PC et **validés contre les limites réelles de l'API** avant envoi (0 erreur, 0 orphelin, 0 parent introuvable) ; copie dans un dossier privé du VPS (700) ; envoi depuis le serveur par le chemin public HTTPS avec le jeton lu sur place (jamais affiché), arrêt au premier lot refusé ; dossier temporaire supprimé ensuite.
- Résultat en production : **1 705 liens dont 5 sites, 1 705 événements** ; répartition par catégorie identique au fichier. Lecture complète par l'API : 1,1 Mo en 0,6 s. API 249 Mo / base 102 Mo / web 36 Mo ; disque 83 %. Les 6 autres sites toujours 200 ; l'API peut toujours écrire ses captures.
- Sauvegarde immédiate faite après chargement (dump 287 Ko), puis nocturne par le timer.
- Pour voir les données dans l'app : ouvrir https://links.sn8w.com → « Synchronisation entre appareils » → URL du serveur + jeton → le premier tirage récupère tout (≈1,1 Mo). Tant que la synchro n'est pas configurée, l'app affiche une liste vide : **lacune d'ergonomie à corriger** (message d'accueil expliquant quoi faire sur un appareil neuf).
- Non fait : copie hors serveur des sauvegardes ; purge du cache Docker ; phase 5 (PWA installable, bookmarklet, Raccourci iOS) ; phase 6.

## 2026-11-05 — Écran d'accueil d'un appareil neuf (« rien dans l'app »)
- Retour utilisateur : sur links.sn8w.com l'app était vide, et la notion de « synchronisation » n'était pas comprise. Cause : la base de production était pleine (1 705 liens), mais chaque navigateur n'a que sa copie locale (IndexedDB, propre à chaque origine) et rien n'expliquait qu'il fallait saisir le jeton. Il n'existe aucun lien automatique avec les favoris Chrome/Edge : les favoris sont dans la base parce qu'ils y ont été importés.
- Correction (front uniquement) : sur un appareil vide et non connecté, un encart « Connecte cet appareil à ton serveur » explique en trois étapes (adresse, jeton, bouton) ; le panneau s'ouvre tout seul et s'appelle « Connexion au serveur » (bouton « Se connecter et charger mes liens ») ; l'adresse du serveur est préremplie quand l'app est servie en HTTPS par son propre serveur (production) ; la liste vide dit quoi faire. L'encart ne s'affiche pas si l'appareil a déjà des liens locaux (ex. environnement de développement).
- Vérifié dans un navigateur sur une origine vide (localhost:4400). Tests : 94 passent (+ test de l'URL proposée).
- Non déployé : ces changements ne sont que dans le dépôt local ; le site en ligne affiche encore l'ancien écran tant que le front n'est pas redéployé (étape 1-2 du README : build + copie de `dist`, remplacement de fichiers statiques, sans redémarrage ni changement de configuration).
- Piège noté : le jeton reste à saisir une fois par navigateur. Idée non réalisée : lien de configuration à ouvrir sur le téléphone (jeton dans le fragment d'URL) — pratique mais le jeton finirait dans l'historique du navigateur ; à décider.

## 2026-11-05 — Front redéployé (écran d'accueil guidé), accord explicite
- Build sur le PC, copie dans un dossier temporaire du VPS (`web/dist.new`), puis remplacement EN PLACE des fichiers de `web/dist` (le conteneur lit ce dossier via un montage de dossier : un `mv` du dossier aurait laissé le conteneur sur l'ancien contenu), retrait des seuls anciens fichiers hachés, suppression du dossier temporaire. Aucun redémarrage, aucune modification de configuration.
- Vérifié : le nouveau `main-*.js` est servi et contient le nouvel écran ; `/` et `/table` 200 ; API sans jeton 401 ; les 6 autres sites 200.
- Jeton remis dans le presse-papiers de l'utilisateur (jamais affiché) pour la première connexion ; à vider ensuite.

## 2026-11-05 — Accès automatique (aucune clé à saisir dans le navigateur) — côté app préparé, serveur NON modifié
- Demande : l'app doit être « déjà connectée » à la base, sans clé à saisir ; l'authentification viendra plus tard.
- Conception : la clé reste côté serveur ; le serveur l'ajoute lui-même aux requêtes de l'app vers l'API (en-tête `X-Api-Token` posé par la passerelle Caddy). Le navigateur n'a aucun jeton. Quand l'authentification sera ajoutée, elle se place devant ce mécanisme (quelques lignes dans le même bloc Caddy) sans rien changer à l'app.
- Côté app : au premier lancement, si l'app est servie en HTTPS par son propre serveur, elle demande une fois à ce serveur si l'API répond SANS jeton (requête minuscule, `since` géant : aucune donnée tirée). 200 → configuration `{serverUrl: origine, token: ''}` et synchro automatique ; 401 → le guide de connexion manuelle reste affiché ; injoignable → guide manuel, nouvel essai à la prochaine ouverture. Jeton vide = aucun en-tête d'authentification envoyé. En développement local / HTTP : jamais de sonde.
- Tests : 99 passent (4 pour la sonde, 1 pour l'en-tête absent).
- **Risque à retenir (décision utilisateur : authentification plus tard)** : tant que rien n'authentifie l'accès, toute personne qui connaît ou trouve l'adresse peut lire et modifier les liens. L'adresse n'est pas publiée, mais les noms de domaine des certificats HTTPS sont listés publiquement (Certificate Transparency) et des robots les parcourent. Atténuations prévues : `X-Robots-Tag: noindex`. À traiter en priorité dès que possible.
- Non appliqué : modification du Caddyfile du serveur et redéploiement du front (en attente d'accord).

## 2026-11-05 — Accès automatique appliqué sur le serveur (accord explicite)
- Appliqué : (1) front redéployé (remplacement en place, ancien `main-*.js` retiré) ; (2) Caddyfile : copie datée `Caddyfile.bak-20261105121437`, ajout dans le seul bloc `links.sn8w.com` de `header_up X-Api-Token` (clé lue dans `.env.prod`, jamais affichée) et `X-Robots-Tag: noindex, nofollow` ; exactement 2 modifications vérifiées par diff avant écriture ; fichier en 600 ; validé ; rechargé sans coupure.
- Vérifié : API sans jeton 200 ; jeton bidon fourni par le client écrasé par le serveur (200) ; en-tête noindex présent ; `/` et `/table` 200 ; 6 autres sites 200 ; Caddy Up. Dans un navigateur sur links.sn8w.com, sans rien saisir : connexion automatique, **1 705 liens**, « Synchronisé », aucun écran de connexion, configuration enregistrée avec jeton vide.
- Bruit dans les logs Caddy : erreurs de certificat pour `www.sn8w.com` (le DNS de `www` pointe chez OVH mutualisé) — préexistant, noté dans l'état des lieux, sans rapport.
- **État de sécurité actuel, à retenir** : AUCUNE authentification. Toute personne qui atteint https://links.sn8w.com lit et modifie les liens (dont des sujets personnels). Les certificats HTTPS sont listés publiquement, donc l'adresse est découvrable. L'API ne voit plus de jeton fourni par le client : la limite d'échecs d'authentification est sans objet, seule la limite de débit globale par IP (120/min) protège. Prochaine étape prioritaire : authentification devant la passerelle (ex. `basic_auth` Caddy, quelques lignes ; ou OIDC plus tard).
- Non fait : authentification ; copie hors serveur des sauvegardes ; phase 5 ; phase 6.

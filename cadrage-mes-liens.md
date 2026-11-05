# Projet : mes-liens (PWA Angular + API Spring Boot, synchronisée)

## Nature du projet

Outil personnel, **entièrement écrit par l'IA**. Philippe ne code pas ici : il relit, valide et utilise. C'est son cas pratique pour l'objectif « maîtriser l'IA pour développer » : formulation des demandes, gestion du contexte, revue du code généré, vérification des tests.

Projet distinct du fil rouge surendettement, qui reste l'exercice où Philippe code lui-même.

## Besoin

Arrêter de garder 40 onglets ouverts. Enregistrer un lien avec une capture, l'étiqueter, le retrouver, voir l'historique chronologique des enregistrements, et **retrouver le tout sur téléphone, iPad et portable**.

## Architecture

- **Front :** Angular en PWA installable, IndexedDB comme cache local, utilisable hors ligne.
- **Back :** Spring Boot et PostgreSQL sur le VPS de Philippe.
- **Synchronisation :** chaque enregistrement porte `updatedAt` et un marqueur de suppression (tombstone). Le client demande les changements depuis sa dernière synchro, pousse les siens, le plus récent gagne, au niveau de l'enregistrement entier. Suffisant en mono-utilisateur.
- **Captures :** fichiers sur le disque du VPS, servis par l'API. Pas de blob en base.

## Authentification : un jeton unique, pas d'OIDC

Un seul utilisateur, donc un jeton long et aléatoire dans un en-tête, en HTTPS uniquement. Keycloak et OIDC sont le travail du projet surendettement.

- **Risque théorique :** un jeton partagé n'offre ni révocation fine ni expiration.
- **Risque réel :** faible (un utilisateur, données sans valeur marchande), mais le VPS est exposé et sera scanné par des robots. D'où : HTTPS obligatoire, jeton de 32 octets aléatoires, limitation de débit, aucune inscription ouverte, jeton en variable d'environnement et jamais dans le dépôt.

## Capture de lien, par appareil

| Appareil | Méthode |
|---|---|
| Portable | Bookmarklet dans la barre de favoris : ouvre la PWA avec URL et titre pré-remplis |
| iPhone, iPad | Raccourci iOS qui ouvre l'URL de la PWA avec le lien partagé en paramètre. Le partage natif vers une PWA n'existe pas sur Safari. |
| Partout | Coller une URL à la main, ou en lot |

## Captures d'écran

- **Phases initiales :** coller depuis le presse-papiers (`Win+Maj+S` puis `Ctrl+V`) et glisser-déposer une image.
- **Phase tardive :** capture automatique depuis l'URL, par Chromium sans interface sur le VPS. Lourd en mémoire, donc à mesurer avant de l'activer.

## Modèle

**Link** : id (UUID généré côté client), url, title, domain, tags[], note, screenshotId, createdAt, updatedAt, deletedAt.

**Event** (journal en ajout seul, jamais modifié ni supprimé) : id, linkId, type (`created`, `tagged`, `untagged`, `note_edited`, `screenshot_added`, `revisited`), payload, at.

Étiquettes libres et à plat, pas de dossiers.

## Phases, avec arrêt et point à la fin de chacune

0. **Découverte du VPS** et plan de déploiement. Aucun code.
1. Squelette du dépôt, modèle partagé, export et import JSON côté front, stockage IndexedDB. Critère : écrire un lien, l'exporter, vider la base, le réimporter à l'identique.
2. API Spring Boot : CRUD, jeton, HTTPS, PostgreSQL, migrations, tests.
3. PWA : enregistrer un lien, coller une capture, lister, rechercher, filtrer par étiquette.
4. Synchronisation bidirectionnelle avec tombstones. Critère : un lien créé hors ligne sur le téléphone apparaît sur le portable après reconnexion.
5. Installation PWA, bookmarklet, Raccourci iOS.
6. Journal d'événements et vue historique.
7. Plus tard, et seulement si l'app est utilisée tous les jours : capture automatique depuis l'URL, puis annotation des captures.

## Prompt à coller dans Claude Code

```
Tu construis « mes-liens », une PWA Angular avec une API Spring Boot synchronisée, déployée sur mon VPS. Je suis Philippe, développeur front-end Angular confirmé.

RÔLES
Tu écris tout le code. Je ne code pas sur ce projet : je relis, je valide, j'utilise. Ce projet est mon cas pratique de développement assisté par IA, donc :
- Explique tes choix brièvement avant de coder, pas après.
- Tiens un journal dans docs/journal.md : ce que tu as fait, les décisions, ce que tu as vérifié en ligne, ce dont tu n'es pas sûr.
- Signale-moi explicitement ce que je devrais relire en priorité à chaque fin de phase, et pourquoi.
- Si tu n'es pas sûr d'un fait, d'une version ou d'une API, dis-le et vérifie en ligne. N'invente rien.
- Distingue risque théorique et risque réel dans tes remarques de sécurité.

BESOIN
J'ai en permanence 40 onglets ouverts pour ne pas oublier des liens (veille technique, formations, offres d'emploi). Je veux enregistrer un lien avec une capture d'écran, l'étiqueter, le retrouver, voir l'historique chronologique de mes enregistrements, et avoir tout ça synchronisé entre mon iPhone, mon iPad et mon portable.

ARCHITECTURE IMPOSÉE
- Front : Angular en PWA installable, IndexedDB comme cache local, fonctionnel hors ligne.
- Back : Spring Boot + PostgreSQL sur mon VPS.
- Synchronisation : chaque enregistrement porte updatedAt et deletedAt (tombstone). Le client demande les changements depuis sa dernière synchro, pousse les siens, le plus récent gagne au niveau de l'enregistrement entier. Les id sont des UUID générés côté client.
- Captures : fichiers sur le disque du VPS, servis par l'API. Pas de blob en base.
- Authentification : UN SEUL jeton aléatoire de 32 octets dans un en-tête, HTTPS uniquement, limitation de débit, aucune inscription. Pas d'OIDC, pas de Keycloak, pas de multi-utilisateur. Le jeton vit dans une variable d'environnement et n'entre jamais dans le dépôt.
- Vérifie en ligne les versions stables actuelles d'Angular, Spring Boot, Java et PostgreSQL avant de figer quoi que ce soit.

MODÈLE
Link : id (UUID client), url, title, domain, tags[], note, screenshotId, createdAt, updatedAt, deletedAt.
Event (journal en ajout seul, jamais modifié ni supprimé) : id, linkId, type (created, tagged, untagged, note_edited, screenshot_added, revisited), payload, at.
Étiquettes libres et à plat, pas de dossiers.

CAPTURES D'ÉCRAN
Au début : coller depuis le presse-papiers et glisser-déposer une image. N'implémente PAS la capture automatique depuis l'URL : c'est une phase tardive.

CAPTURE DE LIEN
Portable : un bookmarklet qui ouvre la PWA avec l'URL et le titre en paramètres.
iOS : un Raccourci qui ouvre l'URL de la PWA avec le lien partagé en paramètre. Le partage natif vers une PWA n'existe pas sur Safari iOS ; vérifie ce point avant de concevoir cette partie.

STRUCTURE
mes-liens/ avec frontend/, backend/, infra/ (déploiement), docs/ (journal.md, decisions/, specs/).

PHASES — arrête-toi et fais le point avec moi à la fin de chacune
0. DÉCOUVERTE, AUCUN CODE. Inspecte mon VPS et rends-moi un état des lieux : système et version, Docker présent ou non, reverse proxy en place (nginx, Caddy, Traefik), PostgreSQL déjà installé ou non, noms de domaine disponibles, certificats TLS existants, mémoire et disque libres. Puis propose-moi un plan de déploiement adapté à ce qui existe déjà, sans rien casser de ce qui tourne. Demande-moi les accès dont tu as besoin. Ne déploie rien à cette phase.
1. Squelette du dépôt, modèle partagé, IndexedDB, export et import JSON. Critère : écrire un lien, l'exporter, vider la base, le réimporter à l'identique.
2. API Spring Boot : CRUD, jeton, PostgreSQL, migrations, tests.
3. PWA : enregistrer, coller une capture, lister, rechercher, filtrer.
4. Synchronisation bidirectionnelle. Critère : un lien créé hors ligne sur le téléphone apparaît sur le portable après reconnexion.
5. Installation PWA, bookmarklet, Raccourci iOS.
6. Journal d'événements et vue historique.

RÈGLES
- Un commit par phase, messages clairs. Ne pousse rien sans mon accord explicite.
- gitleaks en pre-commit dès le premier commit. .gitignore avant tout.
- Tests sur la couche stockage, sur l'export/import et sur la logique de synchronisation au minimum. La synchronisation est la partie où les bugs silencieux coûtent cher : teste les conflits et les suppressions.
- Ne déploie sur le VPS qu'après mon accord, et dis-moi exactement ce que la commande va modifier.

PREMIÈRE TÂCHE
Phase 0 uniquement : l'état des lieux du VPS et le plan de déploiement. Puis propose-moi la création du dépôt GitHub privé Kounrisu/mes-liens et attends ma validation.
```

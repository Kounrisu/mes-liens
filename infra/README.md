# Déploiement de mes-liens sur le VPS — `https://links.sn8w.com`

**Rien de ce qui suit n'est lancé sans accord explicite.** Chaque étape dit ce qu'elle modifie et comment l'annuler.
Contexte, état des lieux du serveur et justification : [`docs/decisions/0001-deploiement-vps.md`](../docs/decisions/0001-deploiement-vps.md).

Ce dossier a été **répété en local** (même images, mêmes Dockerfile/compose, faux secrets) : PostgreSQL 18.6 + 5 migrations, API Java 25 en bonne santé,
repli des routes Angular, refus 401/403, base injoignable depuis le conteneur web, volume des captures écrivable en non-root,
envoi par lots, sauvegarde + **restauration** vérifiées. Empreinte mesurée : ~300 Mo de RAM (API 227 Mo, base 62 Mo, web 11 Mo).

`<vps>` = ton alias SSH ou `debian@<IP du VPS>`.

## Étape 0 — DNS (toi, chez OVH) — prérequis de tout le reste
OVH Manager → `sn8w.com` → Zone DNS → Ajouter une entrée : **A**, sous-domaine `links`, cible = IP du VPS.
Vérification : `nslookup links.sn8w.com` doit renvoyer l'IP du VPS. *Modifie : la zone DNS de `sn8w.com` (une entrée ajoutée). Annuler : supprimer l'entrée.*
Sans cela, Caddy ne peut pas obtenir le certificat Let's Encrypt.

## Étape 1 — Construire sur le PC (le VPS manque de mémoire pour compiler)
```bash
cd backend  && ./mvnw -DskipTests package          # -> target/mes-liens-api-0.0.1-SNAPSHOT.jar
cd frontend && npx ng build                         # -> dist/mes-liens/browser
```
*Modifie : seulement des dossiers de build locaux.*

## Étape 2 — Copier les fichiers sur le VPS
```bash
ssh <vps> 'mkdir -p ~/mes-liens/api ~/mes-liens/web/dist'
scp infra/docker-compose.prod.yml infra/backup.sh <vps>:~/mes-liens/
scp infra/api/Dockerfile <vps>:~/mes-liens/api/
scp infra/web/Caddyfile  <vps>:~/mes-liens/web/
scp backend/target/mes-liens-api-0.0.1-SNAPSHOT.jar <vps>:~/mes-liens/api/mes-liens-api.jar
scp -r frontend/dist/mes-liens/browser/* <vps>:~/mes-liens/web/dist/
```
*Modifie : crée le dossier `~/mes-liens` (≈ 25 Mo). N'affecte aucune autre application. Annuler : `rm -rf ~/mes-liens`.*

## Étape 3 — Créer les secrets **sur le VPS**
```bash
ssh <vps> '( umask 077; printf "DB_PASSWORD=%s\nMESLIENS_TOKEN=%s\n" "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" > ~/mes-liens/.env.prod )'
```
*Modifie : crée `~/mes-liens/.env.prod` (mode 600). Les valeurs ne transitent jamais par une conversation. Pour lire le jeton quand tu configures un appareil :*
`ssh <vps> 'grep MESLIENS_TOKEN ~/mes-liens/.env.prod'`

## Étape 4 — Démarrer les trois conteneurs
```bash
ssh <vps> 'cd ~/mes-liens && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build'
```
*Modifie : télécharge `postgres:18-alpine` (114 Mo) et `eclipse-temurin:25-jre-alpine` (72 Mo) ; crée 3 conteneurs (`mesliens-db`, `mesliens-api`, `mesliens-web`), 2 volumes (`mes-liens_pgdata`, `mes-liens_screenshots`) et 1 réseau privé. Ne publie aucun port, ne touche à aucun conteneur existant. Annuler : `docker compose -f docker-compose.prod.yml down` (les volumes, donc les données, sont conservés ; `down -v` les supprime).*
Contrôle : `docker ps --filter name=mesliens` → `db` et `api` en `healthy`.

## Étape 5 — Brancher le domaine dans le Caddy partagé (seule modification d'une configuration existante)
```bash
ssh <vps> 'cp ~/proxy/Caddyfile ~/proxy/Caddyfile.bak-$(date +%Y%m%d%H%M%S)'
cat infra/caddy-site-block.txt | ssh <vps> 'cat >> ~/proxy/Caddyfile'
ssh <vps> 'docker exec caddy caddy validate --config /etc/caddy/Caddyfile'   # NE PAS continuer si ça échoue
ssh <vps> 'docker exec caddy caddy reload   --config /etc/caddy/Caddyfile'
```
*Modifie : ajoute un bloc au `~/proxy/Caddyfile` (copie datée faite avant). Le rechargement est gracieux : aucun site existant n'est coupé. Le montage de dossier n'est pas utilisé (il obligerait à recréer le conteneur Caddy). Annuler : restaurer la copie `Caddyfile.bak-…` puis `caddy reload`.*

## Étape 6 — Vérifier depuis ton PC
```bash
curl -s -o /dev/null -w "PWA: %{http_code}\n"            https://links.sn8w.com/        # 200
curl -s -o /dev/null -w "route Angular: %{http_code}\n"  https://links.sn8w.com/table   # 200 (repli SPA)
curl -s -o /dev/null -w "API sans jeton: %{http_code}\n" https://links.sn8w.com/api/sync # 401
```
Puis dans l'app : « Synchronisation entre appareils » → URL `https://links.sn8w.com`, et le jeton.

## Étape 7 — Sauvegardes (après accord, nouveau)
`backup.sh` : `pg_dump` + archive des captures, rétention 14 jours dans `~/mes-liens-backups`. `crontab` n'est pas installé sur le serveur : planification par timer systemd (nécessite `sudo`, fichiers à préparer et à valider avec toi). Première exécution manuelle : `ssh <vps> 'sh ~/mes-liens/backup.sh'`.
**Restauration** (testée en local) : `pg_restore -U mesliens -d mesliens --clean --if-exists < db-AAAA-MM-JJ-HHMM.dump`.

## Étape 8 — Libérer du disque (optionnel, après accord)
`docker builder prune` supprime uniquement le cache de build inutilisé (~5,5 Go récupérables sur 14 Go) ; ne touche ni conteneurs ni volumes ni images utilisées.

## Mises à jour ultérieures
Refaire les étapes 1, 2 (jar et `dist` seulement) puis 4. Les migrations Flyway s'appliquent au démarrage de l'API.
**Avant** de déployer une version qui change le schéma : lancer `backup.sh`.

## Ce qui n'est pas couvert (à savoir)
- Une sauvegarde sur le même disque ne protège pas d'une perte du serveur : prévoir un téléchargement périodique vers ton PC.
- PWA installable / service worker : phase 5 (l'en-tête `no-cache` du service worker est déjà prévu dans `web/Caddyfile`).
- Aucun test de charge ; le serveur héberge 7 autres applications.

# 0001 — Déploiement sur le VPS : état des lieux et plan

Statut : **appliqué le 2026-11-05** (étapes 1 à 6 de `infra/README.md`). L'état des lieux ci-dessous a été fait en lecture seule AVANT le déploiement. Restent à faire, sur accord : sauvegardes planifiées et purge du cache Docker.
Ce document ne contient ni adresse, ni identifiant, ni secret (le dépôt est public).

## 1. État des lieux (lecture seule)

| Sujet | Constat |
|---|---|
| Serveur | OVH VPS-1, Strasbourg. Debian 12, noyau 6.1, 2 vCPU, 4 Go RAM, 40 Go disque. Allumé depuis près de 12 semaines. |
| Accès | SSH par clé uniquement, utilisateur non-root. Pare-feu `ufw` actif : 22, 80, 443 ouverts, rien d'autre. |
| Mémoire | 3,7 Go au total, 2,1 Go utilisés, **1,6 Go disponibles, pas de swap**. Un dépassement fait tuer des conteneurs existants. |
| Disque | 7,6 Go libres sur 40 (80 % utilisé). Cache de build Docker : 14 Go, dont ~5,5 Go récupérables ; images : 18,8 Go, ~2,3 Go récupérables. |
| Docker | Docker 29.4 et Compose v5.1. 16 conteneurs actifs (8 applications : RiskLens, LotoKarma, Lenormand, Nesto, Books, Kanji, Stock-tracker + le proxy). |
| Reverse proxy | **Caddy 2 partagé** (`~/proxy`), seul à publier les ports 80/443, un bloc par sous-domaine, réseau Docker externe `web`. Certificats Let's Encrypt automatiques (volume `caddy-data`). |
| PostgreSQL | Pas d'installation sur l'hôte. **Un conteneur `postgres:16` par application**, sans port publié, données dans un volume Docker nommé. |
| Java | RiskLens (Spring Boot) tourne sur Temurin 21 et consomme ~335 Mo. |
| Sauvegardes | **Aucune automatique** : pas de cron utilisateur, seulement un dossier manuel pour LotoKarma. |
| DNS | Zone `sn8w.com` chez OVH. La racine et `www` pointent vers l'hébergement mutualisé OVH, pas vers le VPS. **Pas de DNS générique** : un nouveau sous-domaine exige un enregistrement A. |

Observations hors périmètre (non touchées) : un certificat `lab.sn8w.com` existe sans bloc Caddy correspondant ; le bloc `www.sn8w.com` du Caddyfile ne peut pas obtenir de certificat tant que `www` pointe ailleurs ; aucune des autres bases n'est sauvegardée automatiquement.

## 2. Plan proposé (additif : n'altère aucune application existante)

**Architecture** — trois conteneurs dans `~/mes-liens` :
- `mesliens-db` : `postgres:18-alpine` (version validée par mes tests d'intégration ; PostgreSQL 16 des autres applications n'est pas partagé : isolation totale). Réseau privé interne uniquement, aucun port publié. Volume `mesliens_pgdata`.
- `mesliens-api` : Spring Boot 4.1 / Java 25 (JRE seulement). Réseaux : privé (vers la base) + `web` (vers Caddy). Volume `mesliens_screenshots` pour les captures. Limites : `-Xmx256m`, plafond mémoire du conteneur ~384 Mo.
- `mesliens-web` : petit serveur statique (PWA) avec repli `index.html` pour les routes Angular.

**Caddy : une seule modification, un bloc ajouté** (après copie de sauvegarde datée du Caddyfile, comme les précédentes) :
```
links.sn8w.com {
    handle /api/* { reverse_proxy mesliens-api:8080 }
    handle        { reverse_proxy mesliens-web:80 }
}
```
Rechargement avec `caddy reload` (gracieux, **sans coupure** des autres sites). On évite volontairement le montage d'un dossier statique dans Caddy, qui obligerait à recréer le conteneur Caddy et couperait brièvement tous les sites.
Même origine pour la PWA et l'API : pas de CORS. `MESLIENS_TRUST_XFF=true` est sûr ici car Caddy réécrit `X-Forwarded-*` (le client ne peut pas les forger).

**Secrets** : `MESLIENS_TOKEN` (32 octets) et le mot de passe de la base sont générés **sur le VPS** (`openssl rand`) dans `~/mes-liens/.env.prod` (mode 600), jamais dans le dépôt ni dans une conversation. Tu lis le jeton par SSH pour le saisir une fois par appareil.

**Livraison** : les builds se font **sur ton PC** (le VPS n'a pas la mémoire pour compiler Maven/Angular sans risquer d'arrêter les autres applications), puis copie par `scp` du `.jar` et du dossier `dist`. Sur le VPS : `docker compose up -d --build` avec des images minuscules. Les fichiers `infra/` du dépôt ne contiennent aucun secret.

**Sauvegardes (à mettre en place, nouveau)** : `pg_dump` quotidien + archive des captures, rétention 14 jours, dans un dossier dédié ; copie hors serveur possible (téléchargement périodique vers ton PC).

**Empreinte estimée** : ~300-400 Mo de RAM (JVM bornée + base + serveur statique), ~600 Mo de disque au départ. Tient dans les 1,6 Go disponibles ; la marge disque est plus serrée (voir questions).

## 3. À trancher avant tout déploiement
1. ~~Sous-domaine~~ **Décidé : `links.sn8w.com`.** Reste la création de l'enregistrement DNS `A` → IP du VPS dans la zone OVH (je n'ai pas accès à OVH).
2. **PostgreSQL 18** dans un conteneur dédié (recommandé) ou 16 pour s'aligner sur les autres.
3. **Sauvegardes** : OK pour les mettre en place sur le serveur ?
4. **Disque** : OK pour libérer ~5,5 Go en purgeant le cache de build Docker inutilisé (`docker builder prune`) — commande qui ne touche pas aux conteneurs ni aux volumes, mais à ne lancer qu'avec ton accord.

## 4. Points non vérifiés
- ~~Image Java 25~~ vérifiée sur Docker Hub le 2026-11-05 : `eclipse-temurin:25-jre-alpine` (72 Mo), `postgres:18-alpine`, `caddy:2-alpine` existent.
- Mises à jour de sécurité automatiques du système (`unattended-upgrades`) non vérifiées.
- Aucun test de charge ; le serveur est partagé avec 7 autres applications.

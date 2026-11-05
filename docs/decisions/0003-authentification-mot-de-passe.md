# 0003 — Authentification : identifiant + mot de passe simple (basic_auth de Caddy)

Statut : **appliqué sur le serveur le 2026-11-05**. Ce document ne contient ni identifiant, ni mot de passe, ni hash (dépôt public).

## Contexte
- Après l'accès automatique (0001/journal), le site était ouvert à quiconque connaissait l'adresse. L'utilisateur a demandé une identification ; la connexion Google (décision 0002) a été préparée et testée en local, mais Google Cloud exige la validation en deux étapes sur le compte pour enregistrer l'application. L'utilisateur a choisi la solution immédiate : **un identifiant et un mot de passe simples**. La décision 0002 reste prête pour plus tard (rien n'est appliqué).
- L'identifiant et le mot de passe ont été choisis PAR L'UTILISATEUR et communiqués dans la conversation (ils y figurent donc) : ne pas les réutiliser ailleurs.

## Mise en œuvre
- `basic_auth` de Caddy sur **tout** le site (page ET API), dans le bloc `links.sn8w.com` du Caddy partagé. Seul le **hash bcrypt (coût 11)** est stocké, dans le Caddyfile du serveur (mode 600). Le mot de passe n'est écrit nulle part en clair (vérifié : 0 occurrence sur le serveur).
- L'en-tête `Authorization` est **retiré** avant de transmettre au serveur de la PWA et à l'API : ils ne voient jamais le mot de passe. La clé de l'API est toujours ajoutée par le serveur (aucun jeton dans le navigateur).
- Le navigateur affiche sa fenêtre native d'identifiant, une fois, et peut mémoriser le mot de passe (gestionnaire de mots de passe).
- Outil : `infra/enable-basic-auth.sh` (installe ou CHANGE le mot de passe) : mot de passe par l'entrée standard (jamais en argument), copie datée, contrôles avant écriture, validation, vérification réelle (sans identifiants 401 / mauvais mot de passe 401 / bon mot de passe 200 sur la page et l'API), restauration automatique sinon.
  `printf '%s' 'NOUVEAU-MOT-DE-PASSE' | ssh <vps> 'bash ~/mes-liens/enable-basic-auth.sh <identifiant>'`

## Vérifié (réel, sur le serveur et depuis le PC)
Sans identifiants : page 401 avec `WWW-Authenticate: Basic`, API 401 (même avec une clé d'API bidon fournie par le client). Mauvais mot de passe : 401. Bons identifiants : `/`, `/table`, API 200. 6 autres sites toujours 200. Coût d'une tentative ratée mesuré en local : ~0,09 s de calcul (mots de passe différents ; les tentatives répétées identiques sont mises en cache par Caddy).
Défauts attrapés par les essais locaux AVANT le serveur : (1) mon contrôle comptait les mots « basic_auth » dans les commentaires du modèle (il aurait refusé d'avancer) ; (2) les commentaires du modèle contenaient les marqueurs de remplacement : le vrai hash et la vraie clé auraient été écrits une seconde fois dans des commentaires. Corrigés ; chaque secret n'apparaît maintenant qu'une fois.

## Risques à connaître
- **Mot de passe faible (choix de l'utilisateur)** : un mot courant suivi de deux chiffres figure très probablement dans les listes de mots de passe usuelles. Rien ne limite le nombre d'essais (Caddy standard n'a pas de limitation de débit ; l'API ne voit plus les échecs) : à raison de quelques dizaines d'essais par seconde, une liste courante se teste en quelques minutes. Le site est découvrable (les certificats HTTPS sont listés publiquement). **Recommandation : un mot de passe long (4 mots ou plus) dès que possible**, ou la connexion Google (0002) qui n'a pas ce défaut.
- Chaque tentative ratée consomme du calcul (~0,09 s) sur un serveur partagé : un attaquant peut le ralentir sans entrer. Risque faible mais réel ; une vraie limitation de débit (fail2ban, module Caddy) n'est pas en place.
- Non testé : l'app installée sur l'écran d'accueil de l'iPhone/iPad (comportement de `basic_auth` dans une PWA installée à vérifier en phase 5). Le manifeste de la PWA devra être demandé avec identifiants (`crossorigin="use-credentials"`) ou exclu de la protection.
- Retour arrière : restaurer la dernière copie `~/proxy/Caddyfile.bak-…` (`cat copie > Caddyfile`, pas `mv`) puis `caddy reload` : retour au mode ouvert (accès automatique sans identification).
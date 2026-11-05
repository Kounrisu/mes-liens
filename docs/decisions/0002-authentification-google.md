# 0002 — Authentification : connexion Google, une seule adresse autorisée

Statut : **préparé et testé en local, NON appliqué** (en attente : Google Cloud exige la validation en deux étapes sur le compte de l'utilisateur ; il a choisi en attendant un mot de passe simple, voir 0003). Reste disponible pour plus tard.
Ce document ne contient aucun identifiant, secret ni adresse e-mail (le dépôt est public).

## Contexte et décision
- Le cahier des charges initial disait « un seul jeton, pas d'OIDC ». Le 2026-11-05 l'utilisateur a d'abord voulu un accès sans saisie, puis demandé explicitement une identification par **connexion Google, limitée à son adresse e-mail**. Décision de l'utilisateur : elle remplace l'exigence « pas d'OIDC ». Le jeton unique reste utilisé **entre le serveur de bord et l'API** (il n'est plus jamais dans le navigateur).
- Risque corrigé : depuis l'accès automatique (`gateway-key.sh`), toute personne atteignant `links.sn8w.com` lisait et modifiait les liens, dont des sujets personnels.

## Architecture (aucun code d'authentification dans l'API ni dans le front)
```
navigateur ──https──> Caddy (partagé) ──forward_auth──> oauth2-proxy (mesliens-oauth) ──> Google
                          │ connecté ?  oui : ajoute la clé de l'API et transmet
                          ├── /oauth2/*  : pages de connexion / retour Google (sans être connecté)
                          ├── /api/*     : 401 si non connecté ; sinon + X-Api-Token (clé serveur) vers l'API
                          └── le reste   : redirection vers Google si non connecté ; sinon la PWA
```
- `oauth2-proxy` v7.15.5 (image `quay.io/oauth2-proxy/oauth2-proxy`, vérifiée le 2026-11-05), fournisseur Google, mode « portier » (`--upstream=static://202`).
- **Seules les adresses de `~/mes-liens/auth/emails.txt` entrent**, même avec un compte Google valide (`--authenticated-emails-file`, sans `--email-domain`).
- Cookie `__Host-mesliens` : Secure, HttpOnly, SameSite=Lax, sans Domain, 7 jours, revérifié chaque heure. PKCE S256. `--approval-prompt=auto` (la valeur par défaut `force` ferait redemander l'accord à chaque connexion).
- Montage Caddy `forward_auth` conforme à la documentation officielle d'oauth2-proxy (intégration Caddy).

## Vérifié (maquette locale : Caddy + oauth2-proxy + faux site + fausse API, faux identifiants Google)
- Sans connexion : `/` → 302 vers `/oauth2/sign_in`, qui renvoie directement vers Google avec `client_id`, PKCE S256, `redirect_uri=https://links.sn8w.com/oauth2/callback`, `scope=profile email`, `approval_prompt=auto` ; `/api/sync` → **401** (pas de redirection) ; `/oauth2/auth` → 401.
- Faux cookie : page redirigée, API 401. En-têtes d'identité forgés (`X-Auth-Request-Email`, `X-Forwarded-Email`) : API 401, **ils n'authentifient pas**.
- Cookie de départ de connexion : `Path=/; HttpOnly; Secure; SameSite=Lax`.
- Connecté (simulé avec `--trusted-ip`, uniquement pour ce test) : page servie ; la clé de l'API est ajoutée par le serveur ; une clé fournie par le client est **écrasée**.
- Compose : le service `oauth` n'existe que sous le profil `auth` (sans `.env.auth`, il ne bloque pas le reste).

## NON vérifié (honnêtement)
- **Le vrai aller-retour avec Google** : impossible sans identifiants. À tester dès qu'ils existent : connexion avec l'adresse autorisée (doit entrer), avec un autre compte Google (doit être refusé).
- Le comportement exact de la session après 1 h avec `--approval-prompt=auto` (Google ne renvoie pas toujours de jeton de rafraîchissement aux connexions suivantes). Au pire : reconnexion plus fréquente ; l'app affiche alors « Session expirée » avec un bouton « Se reconnecter ».
- Le conteneur oauth2-proxy accepte les en-têtes `X-Forwarded-*` de tout conteneur du réseau Docker partagé `web` (avertissement d'oauth2-proxy). Risque **théorique** : ils servent à construire les redirections, pas à décider de l'accès ; un cookie de session valide reste indispensable.

## À faire par l'utilisateur chez Google (je n'ai pas accès à son compte)
L'interface de Google change : suivre les libellés, pas les captures. Aller sur https://console.cloud.google.com/ :
1. Créer un projet (nom libre, ex. « mes-liens »).
2. **Écran de consentement OAuth** (menu « API et services » / « Google Auth Platform ») : type d'utilisateur **Externe**, nom de l'application, e-mail d'assistance et de contact = son adresse. Laisser les autorisations par défaut (email, profil, openid). État de publication : **Test**. Ajouter son adresse dans **Utilisateurs de test**.
3. **Identifiants** → Créer des identifiants → **ID client OAuth** → type **Application Web** :
   - Origines JavaScript autorisées : `https://links.sn8w.com`
   - URI de redirection autorisés : `https://links.sn8w.com/oauth2/callback` (exactement, sans barre finale)
4. Noter l'**ID client** (finit par `.apps.googleusercontent.com`) et le **Secret client**. Le secret ne se colle jamais dans une conversation : il se saisit, masqué, sur le serveur (étape suivante).

## Application sur le serveur (après les identifiants), voir `infra/README.md` étape 5c
`auth-setup.sh` (saisie interactive, secret masqué, écrit `.env.auth` et `auth/emails.txt` en 600) → démarrage de `mesliens-oauth` → `enable-google-auth.sh` (remplace le bloc Caddy, vérifie en réel, **restaure l'ancien bloc automatiquement si quoi que ce soit échoue**).
Retour arrière : restaurer la dernière copie `~/proxy/Caddyfile.bak-…` (`cat copie > Caddyfile`, pas `mv`), `caddy reload`, puis `docker compose --profile auth stop oauth`.

## Points d'attention pour la suite
- **PWA (phase 5)** : le fichier `manifest.webmanifest` est demandé par le navigateur sans cookie par défaut : derrière une connexion il recevrait une redirection et l'installation échouerait. Prévoir `crossorigin="use-credentials"` sur le lien du manifeste, ou exclure le manifeste et les icônes de la connexion (fichiers statiques non sensibles).
- **Bookmarklet / Raccourci iOS (phase 5)** : ouvrent la PWA dans le navigateur ; si la session est expirée, la connexion Google s'intercale puis ramène à l'adresse demandée (`rd=`) : à vérifier sur iOS.
- Le compte Google en mode Test : seules les adresses « utilisateurs de test » peuvent se connecter (couche de protection supplémentaire).

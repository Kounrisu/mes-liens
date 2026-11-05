# Organisation et favoris — v0.2.0

- Dans le formulaire, saisir une source puis « Créer un site depuis la source ». Vérifier le nom et l'adresse, puis créer : le site apparaît immédiatement dans « Rattaché au site » et sa sélection remplit la source. Une même adresse de site existante est réutilisée.
- Sélection individuelle dans les cartes, listes, groupes par source et tableaux. Sélection de la page affichée ou de tous les résultats filtrés, y compris au-delà de la pagination.
- Barre commune : ajouter/retirer des étiquettes, attribuer/retirer une catégorie, ajouter une collection, ajouter/retirer les favoris. Autres actions : tri, archivage, vérification et suppression avec confirmation.
- La sélection reste disponible après une action. Les liens exclus par les filtres sont retirés de la sélection.
- Les favoris disposent de leur vue dans Bibliothèque et sont indépendants du classement Focus. Ils sont synchronisés et inclus dans les exports JSON/ZIP.
- Migration V7 : booléen `favorite`, faux par défaut. Un ancien client qui omet ce champ conserve la valeur du serveur. Aucun lien existant n'est automatiquement ajouté aux favoris.

Vérification : 132 tests frontend réussis (2 ignorés existants), 33 tests backend réussis, build Angular de production, parcours navigateur desktop et mobile à 390 px. Régression sur 125 liens sélectionnés, filtres, enchaînement d'actions, sauvegardes et client ancien. Revue 21st des nouveaux contrôles : aucune anomalie détectée.

Déploiement : `infra/deploy-organization-release.sh` sauvegarde la base et l'application, déploie uniquement l'API et les fichiers Angular, conserve les anciens fichiers hachés pour les PWA ouvertes, et vérifie la protection par mot de passe. Le worker et la configuration du proxy restent inchangés.

Déployé le 5 novembre 2026 à 19 h 12 (Paris) sur https://links.sn8w.com. Sauvegarde serveur `2026-11-05-1812`, restauration applicative dans `releases/organization-v1/rollback`. Migration V7 réussie, API saine, 2 718 liens actifs relus avec les champs favoris et apprentissage valides ; empreintes de `index.html` et `ngsw.json` identiques au build testé ; `/library`, `/api/links` et `/api/insights` répondent 401 sans authentification. Contrôles reproductibles : `infra/verify-organization-release.py`. Version : `v0.2.0-organization`. Commits et tag locaux, aucun push Git.

# Bibliothèque personnelle de liens et de connaissances

Décision du 5 novembre 2026 : conserver Angular, Spring Boot, PostgreSQL et la synchronisation hors ligne. L'utilisateur autorise l'implémentation du périmètre élargi et son déploiement sur le VPS existant. Les imports sociaux restent une étape future.

## Objectif

Enregistrer rapidement une ressource, la retrouver visuellement et par recherche, organiser progressivement le stock, suivre ses formations et conserver ce que l'on apprend.

## Livraison autorisée

1. Boîte « À trier » indépendante de la catégorie, classement en lot, détection des doublons, recherche couvrant catégories et sources, archivage réversible.
2. Catégories et sous-catégories, renommage/fusion des catégories et étiquettes, collections transversales, type de ressource.
3. Statut d'apprentissage, objectif, point de reprise, prochaine action, notes de connaissances et date de révision. Réutiliser Focus.
4. Aperçus et captures automatiques des pages publiques, vérification des liens en arrière-plan, date du dernier contrôle, distinction entre accès refusé et lien supprimé. Préserver les captures manuelles et les notes.

## Principes

- Les nouveaux liens arrivent dans À trier, même si une catégorie est suggérée.
- Les données existantes sont conservées et les anciens exports restent lisibles.
- Les sous-catégories sont indépendantes du rattachement d'un lien à son site.
- Les échecs réseau ne suppriment jamais de ressources.
- Les données automatiques sont séparées des données personnelles pour ne pas écraser les notes lors de la synchronisation.
- L'import affiche un aperçu avant application ; les modifications en lot sont atomiques localement.
- Les visites automatisées bloquent les réseaux privés, les protocoles non HTTP(S) et les redirections vers des destinations interdites.
- Respecter le serveur partagé : un seul navigateur de capture à la fois, mémoire et délais bornés.

## Étape ultérieure

Imports X, Facebook et Instagram : adaptateurs à partir d'exports réels, puis connecteurs lorsque disponibles. Conserver provenance, auteur, date et distinction enregistré/aimé. Suggestions IA et OCR pourront venir ensuite.

## Vérifications et livraison

Tests front, tests d'intégration PostgreSQL, tests de sécurité du récupérateur, vérification des interactions et de la compilation ; sauvegarde du serveur avant migration ; déploiement limité à mes-liens ; contrôle des routes, API et worker ; commit et tag de version. Journal détaillé dans docs/journal.md.

## Analyse initiale

Le projet possède déjà captures manuelles, tags, catégories plates, notes, Focus, import/export, PWA et synchro. Recherche limitée au titre/URL/notes/tags ; pas de détection des URL déjà enregistrées ; pas de progression ni de vérification de liens. Vérification initiale : build réussi, 120 tests front réussis, 2 ignorés (TEMP/TMP redirigés dans .angular/test-temp pour l'environnement Windows).

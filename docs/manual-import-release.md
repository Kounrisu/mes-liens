# Imports manuels et formation — v0.4.0

Depuis « Importer depuis mes comptes », installer le favori de collecte, ouvrir ses éléments enregistrés dans son navigateur connecté, faire défiler puis exporter le fichier JSON. Examiner ce fichier dans mes-liens avant de l'importer. La collecte est volontairement manuelle et ne demande aucun mot de passe.

- YouTube : collecter les playlists puis les vidéos de chacune. La vue Playlists regroupe les vidéos importées et conserve les appartenances multiples.
- X, Facebook et Instagram : collecte des liens présents dans la page des éléments enregistrés. Seuls les éléments chargés sont capturés ; les politiques de sécurité des sites peuvent bloquer le favori. Les descriptions et auteurs sont récupérés quand disponibles et restent modifiables.
- Imports répétés : reconnaissance des doublons, conservation des notes, titres et classements personnels, enrichissement des champs vides. Les liens supprimés ne sont pas recréés et une capture partielle ne supprime rien.
- Formation : aperçu des propositions de classement avant application, dont JavaScript, TypeScript, Angular, Java, DevOps, Security et Fullstack. Les sources ouvrent leur propre catalogue filtrable.
- Ressources : description, auteur, date de publication et playlists, avec validation côté navigateur et API. Les anciens clients conservent les nouveaux champs lors de leurs mises à jour.

Validation : 155 tests frontend réussis, 2 tests préexistants ignorés ; 6 tests backend réussis ; compilation API et frontend de production ; 26 modèles couverts par les traductions ; revue UI sans anomalie détectée. Pas de tests d'intégration Docker locaux (moteur indisponible). Le navigateur local a expiré lors du contrôle visuel ; contrôle des pages en production prévu après livraison. Avertissement de taille initiale : 504,45 ko pour un seuil conseillé de 500 ko.

Livraison : API puis frontend, sauvegarde serveur et restauration automatique en cas d'échec. Pas de migration du schéma. Vérification des empreintes de tous les fichiers et du JAR, des nouveaux champs sur tous les liens et de la protection des routes. Anciens fichiers frontend conservés pour les sessions déjà ouvertes.

Cette livraison installe les outils ; elle n'importe pas les comptes et n'applique pas le classement à la collection. L'audit réseau et la suppression des liens cassés restent en attente de l'autorisation demandée précédemment, après le blocage du contrôle automatique d'approbation.

# Sous-catégories de formation — v0.3.1

Sous Formation : TypeScript, Angular, Java, JavaScript, Figma, Web, React, CSS, Security (sécurité en français) et DevOps. Chemins stockés : `formation / typescript`, `formation / angular`, etc.

Les dix propositions sont disponibles sans lien préexistant dans le formulaire, le classement en lot, la Bibliothèque et le filtre Tableau. Les catégories personnalisées restent disponibles. Le gestionnaire de renommage ne propose que les catégories effectivement utilisées.

Les compteurs additionnent les descendants à chaque niveau. Le filtre Tableau suit désormais la même règle que Bibliothèque et les pages de catégories. Les vidéos `formation / …` rejoignent la section Formation de YouTube. Les compteurs de catégories de la navigation excluent les archives, comme leurs pages.

Validation : build Angular de production et contrôle des traductions ; tests de présence des dix thèmes à vide, conservation des catégories personnalisées, comptage des descendants et des suppressions, regroupement YouTube et filtrage hiérarchique du Tableau.

Livraison frontend uniquement dans `releases/subcategories-v1`. Les scripts de déploiement et de vérification frontend acceptent maintenant un nom de livraison validé ; leur valeur par défaut reste `bilingual-v1`.

-- Page « Focus » : rang du lien dans la liste des favoris à apprendre (1 = en tête). NULL = pas dans le focus.
-- Pas d'unicité : deux appareils peuvent attribuer le même rang hors ligne ; le client départage et renumérote.
ALTER TABLE links ADD COLUMN focus_rank INTEGER;

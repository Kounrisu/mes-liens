-- Catégorie (une seule par lien : formation, manga, anime, utile…) et source (site : Udemy, Frontend Masters…).
-- Valeur par défaut constante : n'active pas le trigger de curseur sur les lignes existantes.
ALTER TABLE links ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE links ADD COLUMN source   TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_links_category ON links (category);

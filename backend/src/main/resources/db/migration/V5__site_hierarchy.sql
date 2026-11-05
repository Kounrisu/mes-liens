-- Un lien peut être un « site » (plateforme : Udemy, app.ultimatecourses.com…) ou être rattaché à un site (parent_id).
-- Pas de clé étrangère : en synchronisation, le site peut arriver après ses liens, ou être supprimé (tombstone) ailleurs ;
-- le client tolère un parent absent ou supprimé (le lien s'affiche alors sans site).
ALTER TABLE links ADD COLUMN kind TEXT NOT NULL DEFAULT 'link' CHECK (kind IN ('link', 'site'));
ALTER TABLE links ADD COLUMN parent_id UUID;
CREATE INDEX idx_links_parent ON links (parent_id) WHERE parent_id IS NOT NULL;

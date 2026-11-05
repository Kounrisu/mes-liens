-- Curseur de synchronisation attribué PAR LE SERVEUR, monotone, indépendant des horloges des appareils.
-- (Un curseur basé sur updated_at perdrait un lien créé hors ligne puis poussé après la synchro d'un autre appareil.)
CREATE SEQUENCE sync_seq;

-- ADD COLUMN avec DEFAULT volatil : réécriture de table, ne déclenche pas le trigger append-only d'events.
ALTER TABLE links  ADD COLUMN server_seq BIGINT NOT NULL DEFAULT nextval('sync_seq');
ALTER TABLE events ADD COLUMN server_seq BIGINT NOT NULL DEFAULT nextval('sync_seq');

CREATE UNIQUE INDEX idx_links_server_seq  ON links (server_seq);
CREATE UNIQUE INDEX idx_events_server_seq ON events (server_seq);

-- Chaque écriture réelle d'un lien (insert ou update) reçoit un nouveau numéro.
CREATE FUNCTION bump_server_seq() RETURNS trigger AS $$
BEGIN
    NEW.server_seq := nextval('sync_seq');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER links_bump_seq  BEFORE INSERT OR UPDATE ON links  FOR EACH ROW EXECUTE FUNCTION bump_server_seq();
CREATE TRIGGER events_bump_seq BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION bump_server_seq();

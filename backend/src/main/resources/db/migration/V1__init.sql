CREATE TABLE links (
    id            UUID PRIMARY KEY,
    url           TEXT        NOT NULL,
    title         TEXT        NOT NULL DEFAULT '',
    domain        TEXT        NOT NULL DEFAULT '',
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    note          TEXT        NOT NULL DEFAULT '',
    screenshot_id UUID,
    created_at    TIMESTAMPTZ NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL,
    deleted_at    TIMESTAMPTZ
);
-- Synchronisation : "tout ce qui a changé depuis T" (tombstones inclus)
CREATE INDEX idx_links_updated_at ON links (updated_at);
CREATE INDEX idx_links_tags ON links USING GIN (tags);

-- Journal en ajout seul : jamais modifié ni supprimé (garanti aussi côté base)
CREATE TABLE events (
    id      UUID PRIMARY KEY,
    link_id UUID        NOT NULL,
    type    TEXT        NOT NULL CHECK (type IN ('created','tagged','untagged','note_edited','screenshot_added','revisited')),
    payload JSONB       NOT NULL DEFAULT '{}',
    at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_events_link ON events (link_id);
CREATE INDEX idx_events_at ON events (at);

CREATE FUNCTION events_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_no_update_delete
    BEFORE UPDATE OR DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION events_append_only();

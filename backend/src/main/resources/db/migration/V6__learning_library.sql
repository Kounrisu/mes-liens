ALTER TABLE links ALTER COLUMN category TYPE varchar(200);
ALTER TABLE links ADD COLUMN library jsonb NOT NULL DEFAULT '{"reviewed":false,"archived":false,"resourceType":"other","collections":[],"learningStatus":"later","objective":"","resumeAt":"","nextAction":"","learned":"","applyTo":"","reviewOn":""}'::jsonb;

-- Automatic observations never update personal link records or their sync clocks.
CREATE TABLE link_insights (
  link_id uuid PRIMARY KEY REFERENCES links(id),
  url text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  http_status integer,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  final_url text NOT NULL DEFAULT '',
  screenshot_id uuid,
  checked_at timestamptz,
  captured_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  claim_id uuid,
  failures integer NOT NULL DEFAULT 0
);
CREATE INDEX link_insights_due ON link_insights(next_check_at);

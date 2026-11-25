-- Forward-only M4 simulation workbench persistence tables (append-only, non-destructive).
-- Preserves strict physical separation between public_catalog and simulation schemas.

CREATE TABLE IF NOT EXISTS simulation.activity_location (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL CHECK (activity_revision > 0),
  label text NOT NULL CHECK (length(trim(label)) > 0),
  coordinates geography(Point, 4326),
  precision text NOT NULL CHECK (precision IN ('venue', 'approximate', 'administrative-area', 'unknown')),
  public_granularity text NOT NULL CHECK (public_granularity IN ('venue', 'district', 'municipality', 'prefecture', 'withheld')),
  acquisition_basis text NOT NULL CHECK (length(trim(acquisition_basis)) > 0),
  confirmed_on date,
  CHECK (precision <> 'unknown' OR coordinates IS NULL),
  FOREIGN KEY (activity_id, activity_revision) REFERENCES simulation.activity_revision(id, revision)
);

CREATE INDEX IF NOT EXISTS idx_sim_activity_location_coords
  ON simulation.activity_location USING GIST (coordinates);

CREATE TABLE IF NOT EXISTS simulation.participation_condition (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL CHECK (activity_revision > 0),
  time_zone text NOT NULL CHECK (length(trim(time_zone)) > 0),
  payload jsonb NOT NULL,
  UNIQUE (activity_id, activity_revision),
  FOREIGN KEY (activity_id, activity_revision) REFERENCES simulation.activity_revision(id, revision)
);

CREATE TABLE IF NOT EXISTS simulation.resource_requirement (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL CHECK (activity_revision > 0),
  category text NOT NULL CHECK (category IN ('labor', 'skill', 'tool', 'material', 'venue', 'other')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  quantity jsonb NOT NULL,
  required boolean NOT NULL,
  note text,
  FOREIGN KEY (activity_id, activity_revision) REFERENCES simulation.activity_revision(id, revision)
);

CREATE TABLE IF NOT EXISTS simulation.actor_profile (
  actor_id text PRIMARY KEY REFERENCES simulation.actor(id),
  base_coordinates geography(Point, 4326),
  available_transport_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  willingness text NOT NULL CHECK (willingness IN ('explicit-interest', 'open', 'unknown')),
  note text
);

CREATE TABLE IF NOT EXISTS simulation.ai_assessment_detail (
  recommendation_id text PRIMARY KEY REFERENCES simulation.ai_recommendation(id),
  triage_signal text NOT NULL CHECK (triage_signal IN ('recommended-for-human-review', 'caution-human-review', 'insufficient-evidence-for-review')),
  provider text NOT NULL CHECK (length(trim(provider)) > 0),
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  risks_and_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_human_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  uncertainties jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS simulation.collaboration_note (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  mode text NOT NULL CHECK (mode = 'simulation'),
  external_contact_sent boolean NOT NULL CHECK (external_contact_sent = false),
  case_id text NOT NULL REFERENCES simulation.collaboration_case(id),
  case_revision integer NOT NULL CHECK (case_revision > 0),
  from_stage text NOT NULL CHECK (from_stage IN ('draft', 'requested', 'responded', 'coordinating', 'agreed', 'preparing')),
  to_stage text NOT NULL CHECK (to_stage IN ('draft', 'requested', 'responded', 'coordinating', 'agreed', 'preparing')),
  actor_account_id text NOT NULL CHECK (length(trim(actor_account_id)) > 0),
  note text NOT NULL CHECK (length(trim(note)) > 0),
  recorded_at timestamptz NOT NULL
);

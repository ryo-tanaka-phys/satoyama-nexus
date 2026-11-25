-- M1-06 Migration 0001: PostGIS extension, separated schemas, and public_catalog tables (D03/D04/D05/D08)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS public_catalog;
CREATE SCHEMA IF NOT EXISTS simulation;
CREATE SCHEMA IF NOT EXISTS ops_audit;

CREATE TABLE IF NOT EXISTS public_catalog.source_document (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  url text NOT NULL CHECK (url ~ '^https?://'),
  publisher text NOT NULL CHECK (length(trim(publisher)) > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  accessed_on date NOT NULL,
  published_on date,
  updated_on date,
  summary text NOT NULL CHECK (length(trim(summary)) > 0),
  url_status text NOT NULL CHECK (url_status IN ('unchecked', 'checked')),
  usage_status text NOT NULL CHECK (usage_status IN ('unchecked', 'permitted', 'restricted')),
  usage_evidence text,
  CHECK (usage_status = 'unchecked' OR (usage_evidence IS NOT NULL AND length(trim(usage_evidence)) > 0))
);

CREATE TABLE IF NOT EXISTS public_catalog.activity (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  current_revision integer NOT NULL CHECK (current_revision > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public_catalog.activity_revision (
  id text NOT NULL REFERENCES public_catalog.activity(id),
  revision integer NOT NULL CHECK (revision > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  PRIMARY KEY (id, revision)
);

CREATE TABLE IF NOT EXISTS public_catalog.source_assertion (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL,
  field text NOT NULL CHECK (field IN ('title', 'summary', 'recruitment')),
  source_id text NOT NULL REFERENCES public_catalog.source_document(id),
  value text NOT NULL CHECK (length(trim(value)) > 0),
  status text NOT NULL CHECK (status IN ('unverified', 'confirmed', 'conflicting')),
  checked_by text,
  checked_at timestamptz,
  FOREIGN KEY (activity_id, activity_revision) REFERENCES public_catalog.activity_revision(id, revision),
  CHECK ((checked_by IS NULL AND checked_at IS NULL) OR (checked_by IS NOT NULL AND length(trim(checked_by)) > 0 AND checked_at IS NOT NULL)),
  CHECK (status = 'unverified' OR (checked_by IS NOT NULL AND checked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public_catalog.actor (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  kind text NOT NULL CHECK (kind IN ('person', 'organization', 'government-body')),
  current_revision integer NOT NULL CHECK (current_revision > 0),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  expertise jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public_catalog.actor_revision (
  actor_id text NOT NULL REFERENCES public_catalog.actor(id),
  revision integer NOT NULL CHECK (revision > 0),
  kind text NOT NULL CHECK (kind IN ('person', 'organization', 'government-body')),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  expertise jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (actor_id, revision)
);

CREATE TABLE IF NOT EXISTS public_catalog.actor_source_assertion (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  actor_id text NOT NULL,
  actor_revision integer NOT NULL,
  field text NOT NULL CHECK (field IN ('displayName', 'kind', 'expertise')),
  source_id text NOT NULL REFERENCES public_catalog.source_document(id),
  value text NOT NULL CHECK (length(trim(value)) > 0),
  status text NOT NULL CHECK (status IN ('unverified', 'confirmed', 'conflicting')),
  checked_by text,
  checked_at timestamptz,
  FOREIGN KEY (actor_id, actor_revision) REFERENCES public_catalog.actor_revision(actor_id, revision),
  CHECK ((checked_by IS NULL AND checked_at IS NULL) OR (checked_by IS NOT NULL AND length(trim(checked_by)) > 0 AND checked_at IS NOT NULL)),
  CHECK (status = 'unverified' OR (checked_by IS NOT NULL AND checked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public_catalog.activity_location (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) > 0),
  coordinates geography(Point, 4326),
  precision text NOT NULL CHECK (precision IN ('venue', 'approximate', 'administrative-area', 'unknown')),
  public_granularity text NOT NULL CHECK (public_granularity IN ('venue', 'district', 'municipality', 'prefecture', 'withheld')),
  acquisition_basis text NOT NULL CHECK (length(trim(acquisition_basis)) > 0),
  confirmed_on date,
  source_id text NOT NULL REFERENCES public_catalog.source_document(id),
  FOREIGN KEY (activity_id, activity_revision) REFERENCES public_catalog.activity_revision(id, revision),
  CHECK (precision <> 'unknown' OR coordinates IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_pub_activity_location_gist
  ON public_catalog.activity_location USING gist (coordinates);

CREATE TABLE IF NOT EXISTS public_catalog.participation_condition (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL,
  time_zone text NOT NULL CHECK (length(trim(time_zone)) > 0),
  payload jsonb NOT NULL,
  source_id text NOT NULL REFERENCES public_catalog.source_document(id),
  UNIQUE (activity_id, activity_revision),
  FOREIGN KEY (activity_id, activity_revision) REFERENCES public_catalog.activity_revision(id, revision)
);

CREATE TABLE IF NOT EXISTS public_catalog.resource_requirement (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  activity_id text NOT NULL,
  activity_revision integer NOT NULL,
  category text NOT NULL CHECK (category IN ('labor', 'skill', 'tool', 'material', 'venue', 'other')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  quantity jsonb NOT NULL,
  required boolean NOT NULL,
  note text,
  source_id text NOT NULL REFERENCES public_catalog.source_document(id),
  FOREIGN KEY (activity_id, activity_revision) REFERENCES public_catalog.activity_revision(id, revision)
);

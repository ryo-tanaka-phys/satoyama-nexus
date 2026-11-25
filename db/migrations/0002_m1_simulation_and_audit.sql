-- M1-06 Migration 0002: simulation domain tables and append-only ops_audit tables (D01/D03/D06/D08)

CREATE TABLE IF NOT EXISTS simulation.actor (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  kind text NOT NULL CHECK (kind IN ('person', 'organization', 'government-body')),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  expertise jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS simulation.activity (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  current_revision integer NOT NULL CHECK (current_revision > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS simulation.activity_revision (
  id text NOT NULL REFERENCES simulation.activity(id),
  revision integer NOT NULL CHECK (revision > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  PRIMARY KEY (id, revision)
);

CREATE TABLE IF NOT EXISTS simulation.collaboration_case (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  mode text NOT NULL CHECK (mode = 'simulation'),
  public_activity_id text,
  public_activity_revision integer,
  simulated_activity_id text,
  simulated_activity_revision integer,
  revision integer NOT NULL CHECK (revision > 0),
  stage text NOT NULL CHECK (stage IN ('draft', 'requested', 'coordinating', 'agreed', 'preparing')),
  CHECK (
    (public_activity_id IS NOT NULL AND public_activity_revision IS NOT NULL AND simulated_activity_id IS NULL AND simulated_activity_revision IS NULL)
    OR
    (public_activity_id IS NULL AND public_activity_revision IS NULL AND simulated_activity_id IS NOT NULL AND simulated_activity_revision IS NOT NULL)
  ),
  FOREIGN KEY (public_activity_id, public_activity_revision) REFERENCES public_catalog.activity_revision(id, revision),
  FOREIGN KEY (simulated_activity_id, simulated_activity_revision) REFERENCES simulation.activity_revision(id, revision)
);

-- Strictly references simulation.actor only: DB physically rejects public_catalog actors as CaseParty.
CREATE TABLE IF NOT EXISTS simulation.case_party (
  case_id text NOT NULL REFERENCES simulation.collaboration_case(id),
  actor_id text NOT NULL REFERENCES simulation.actor(id),
  role text NOT NULL CHECK (length(trim(role)) > 0),
  PRIMARY KEY (case_id, actor_id)
);

CREATE TABLE IF NOT EXISTS simulation.case_governance (
  case_id text PRIMARY KEY REFERENCES simulation.collaboration_case(id),
  created_by_account_id text NOT NULL CHECK (length(trim(created_by_account_id)) > 0),
  last_material_change_by_account_id text,
  last_material_change_revision integer NOT NULL CHECK (last_material_change_revision > 0)
);

CREATE TABLE IF NOT EXISTS simulation.ai_recommendation (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  case_id text NOT NULL REFERENCES simulation.collaboration_case(id),
  case_revision integer NOT NULL CHECK (case_revision > 0),
  model text NOT NULL CHECK (length(trim(model)) > 0),
  prompt_version text NOT NULL CHECK (length(trim(prompt_version)) > 0),
  rationale text NOT NULL CHECK (length(trim(rationale)) > 0),
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status = 'requires-human-review')
);

CREATE TABLE IF NOT EXISTS simulation.review_record (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  case_id text NOT NULL REFERENCES simulation.collaboration_case(id),
  case_revision integer NOT NULL CHECK (case_revision > 0),
  ai_recommendation_id text REFERENCES simulation.ai_recommendation(id),
  ai_recommendation_version text,
  reviewer_account_id text NOT NULL CHECK (length(trim(reviewer_account_id)) > 0),
  permission_scope text NOT NULL CHECK (length(trim(permission_scope)) > 0),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  reviewed_at timestamptz NOT NULL,
  policy_version text NOT NULL CHECK (length(trim(policy_version)) > 0)
);

CREATE TABLE IF NOT EXISTS ops_audit.processed_operation (
  operation_id text PRIMARY KEY CHECK (length(trim(operation_id)) > 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops_audit.audit_event (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  operation_id text NOT NULL CHECK (length(trim(operation_id)) > 0),
  actor_account_id text,
  action text NOT NULL CHECK (action IN ('case.review', 'case.material-change', 'case.transition', 'audit.read', 'catalog.curate')),
  target_id text NOT NULL CHECK (length(trim(target_id)) > 0),
  target_revision integer,
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  occurred_at timestamptz NOT NULL,
  correlation_id text NOT NULL CHECK (length(trim(correlation_id)) > 0),
  diff_summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

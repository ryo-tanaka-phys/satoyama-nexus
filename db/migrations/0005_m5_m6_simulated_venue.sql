-- Forward-only P1 (M5/M6) simulated venue persistence tables.
-- Additive only: preserves existing 0001-0004 contracts, public_catalog separation,
-- and simulation.actor kind constraints (corporate entities live in separated tables).

CREATE TABLE IF NOT EXISTS simulation.venue_profile (
  actor_id text PRIMARY KEY REFERENCES simulation.actor(id),
  grid_cell_id text,
  postal_code text,
  interest_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  strength_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Self-introduction card for human active matching only; excluded from M2/M3 AI inputs.
  bio text NOT NULL DEFAULT '',
  -- Internal demographic fields; never exposed to other users in public profile responses.
  age_internal integer CHECK (age_internal IS NULL OR (age_internal >= 0 AND age_internal <= 130)),
  gender_internal text,
  seeking_match boolean NOT NULL DEFAULT false,
  org_certification_status text NOT NULL DEFAULT 'none'
    CHECK (org_certification_status IN ('none', 'pending', 'certified', 'rejected')),
  expert_certified boolean NOT NULL DEFAULT false,
  expert_certification_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.demo_account (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  display_name text NOT NULL CHECK (length(trim(display_name)) > 0),
  role_track text NOT NULL CHECK (role_track IN ('citizen', 'organization', 'government', 'operator')),
  actor_id text NOT NULL REFERENCES simulation.actor(id),
  operated_actor_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  grants jsonb NOT NULL DEFAULT '[]'::jsonb,
  passcode_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS simulation.demo_session (
  token_hash text PRIMARY KEY CHECK (length(trim(token_hash)) = 64),
  account_id text NOT NULL REFERENCES simulation.demo_account(id),
  mode text NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'werewolf')),
  werewolf_room_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sim_demo_session_account
  ON simulation.demo_session (account_id);

CREATE TABLE IF NOT EXISTS simulation.actor_membership (
  person_actor_id text NOT NULL REFERENCES simulation.actor(id),
  organization_actor_id text NOT NULL REFERENCES simulation.actor(id),
  role text NOT NULL CHECK (role IN ('leader', 'member')),
  is_dummy boolean NOT NULL DEFAULT false,
  certified_by_account_id text,
  certified_at timestamptz,
  PRIMARY KEY (person_actor_id, organization_actor_id)
);

-- Track 2: Operator certification requests (organization legal-entity model & expert credentials)
CREATE TABLE IF NOT EXISTS simulation.certification_request (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  kind text NOT NULL CHECK (kind IN ('organization', 'expert')),
  applicant_account_id text NOT NULL REFERENCES simulation.demo_account(id),
  target_actor_id text NOT NULL REFERENCES simulation.actor(id),
  organization_name text,
  summary text NOT NULL CHECK (length(trim(summary)) > 0),
  evidence_note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_account_id text,
  review_reason text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Track 3: Horizontal social feed, active connections, and certified organization workspace
CREATE TABLE IF NOT EXISTS simulation.social_post (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  author_actor_id text NOT NULL REFERENCES simulation.actor(id),
  channel text NOT NULL CHECK (channel IN ('horizontal', 'public-offer', 'activity-log')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  grid_cell_id text,
  endorsement_count integer NOT NULL DEFAULT 0 CHECK (endorsement_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.social_comment (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  post_id text NOT NULL REFERENCES simulation.social_post(id),
  author_actor_id text NOT NULL REFERENCES simulation.actor(id),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  is_expert_advice boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.active_connection (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  from_actor_id text NOT NULL REFERENCES simulation.actor(id),
  to_actor_id text NOT NULL REFERENCES simulation.actor(id),
  post_id text REFERENCES simulation.social_post(id),
  support_status text NOT NULL DEFAULT 'unsupported-informal'
    CHECK (support_status IN ('unsupported-informal', 'activity-applied', 'officially-supported')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.org_calendar_event (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  organization_actor_id text NOT NULL REFERENCES simulation.actor(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  scheduled_date date NOT NULL,
  grid_cell_id text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed')),
  participant_count integer NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.org_chat_message (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  organization_actor_id text NOT NULL REFERENCES simulation.actor(id),
  sender_account_id text NOT NULL REFERENCES simulation.demo_account(id),
  sender_display_name text NOT NULL CHECK (length(trim(sender_display_name)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Track 4: Vertical public interactions, simplified activity reports, and notifications
CREATE TABLE IF NOT EXISTS simulation.activity_report (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  organization_actor_id text NOT NULL REFERENCES simulation.actor(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  period_label text NOT NULL CHECK (length(trim(period_label)) > 0),
  calendar_event_count integer NOT NULL DEFAULT 0 CHECK (calendar_event_count >= 0),
  social_log_count integer NOT NULL DEFAULT 0 CHECK (social_log_count >= 0),
  expert_advice_count integer NOT NULL DEFAULT 0 CHECK (expert_advice_count >= 0),
  summary_text text NOT NULL CHECK (length(trim(summary_text)) > 0),
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_account_id text NOT NULL REFERENCES simulation.demo_account(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.public_interaction (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  direction text NOT NULL CHECK (direction IN ('to-government', 'from-government')),
  kind text NOT NULL CHECK (kind IN ('petition', 'support-request', 'government-offer', 'partnership-offer')),
  from_actor_id text NOT NULL REFERENCES simulation.actor(id),
  to_actor_id text NOT NULL REFERENCES simulation.actor(id),
  report_id text REFERENCES simulation.activity_report(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under-review', 'questioned', 'approved', 'supported', 'returned', 'accepted', 'declined')),
  latest_decision_reason text,
  decided_by_account_id text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.public_interaction_event (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  interaction_id text NOT NULL REFERENCES simulation.public_interaction(id),
  actor_account_id text NOT NULL CHECK (length(trim(actor_account_id)) > 0),
  from_status text,
  to_status text NOT NULL CHECK (length(trim(to_status)) > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.venue_notification (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  recipient_actor_id text NOT NULL REFERENCES simulation.actor(id),
  category text NOT NULL CHECK (category IN ('matching', 'corporate-offer', 'government-action', 'certification', 'social')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  reference_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sim_venue_notification_recipient
  ON simulation.venue_notification (recipient_actor_id, created_at DESC);

-- Separated corporate sponsor domain (physically decoupled from simulation.actor)
CREATE TABLE IF NOT EXISTS simulation.corporate_sponsor (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  industry text NOT NULL CHECK (length(trim(industry)) > 0),
  summary text NOT NULL CHECK (length(trim(summary)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.corporate_support_plan (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  sponsor_id text NOT NULL REFERENCES simulation.corporate_sponsor(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  support_type text NOT NULL CHECK (support_type IN ('materials', 'funding', 'safety-equipment')),
  summary text NOT NULL CHECK (length(trim(summary)) > 0),
  required_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_certified_org boolean NOT NULL DEFAULT false,
  requires_activity_report boolean NOT NULL DEFAULT false,
  requires_expert_advice boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.corporate_support_offer (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  plan_id text NOT NULL REFERENCES simulation.corporate_support_plan(id),
  target_actor_id text NOT NULL REFERENCES simulation.actor(id),
  matched_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'acknowledged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, target_actor_id)
);

-- Separated werewolf demo mode wrapper tables
CREATE TABLE IF NOT EXISTS simulation.demo_werewolf_room (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  code text NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  operator_account_id text NOT NULL REFERENCES simulation.demo_account(id),
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'assigned', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation.demo_werewolf_assignment (
  room_id text NOT NULL REFERENCES simulation.demo_werewolf_room(id),
  account_id text NOT NULL REFERENCES simulation.demo_account(id),
  assigned_role text NOT NULL CHECK (assigned_role IN ('citizen', 'expert-candidate', 'organization', 'government')),
  mission_hint text NOT NULL DEFAULT '',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, account_id)
);

-- Append-only venue audit log (Track 2 & Track 4 transparency backing store)
CREATE TABLE IF NOT EXISTS ops_audit.venue_audit_event (
  id text PRIMARY KEY CHECK (length(trim(id)) > 0),
  actor_account_id text,
  action text NOT NULL CHECK (length(trim(action)) > 0),
  target_id text NOT NULL CHECK (length(trim(target_id)) > 0),
  outcome text NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  reason_code text NOT NULL CHECK (length(trim(reason_code)) > 0),
  detail_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

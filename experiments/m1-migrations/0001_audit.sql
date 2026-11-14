CREATE TABLE m1_simulation.audit_event (
 id text PRIMARY KEY, case_id text NOT NULL REFERENCES m1_simulation.collaboration_case(id),
 case_revision integer NOT NULL CHECK(case_revision>0), event text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);

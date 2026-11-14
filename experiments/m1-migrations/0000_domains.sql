CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE SCHEMA m1_catalog;
--> statement-breakpoint
CREATE SCHEMA m1_simulation;
--> statement-breakpoint
CREATE TABLE m1_catalog.activity_revision (
 id text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 title text NOT NULL CHECK(length(trim(title))>0),
 source_url text NOT NULL CHECK(length(trim(source_url))>0),
 location geography(Point,4326), precision text NOT NULL,
 public_granularity text NOT NULL, evidence text NOT NULL CHECK(length(trim(evidence))>0),
 PRIMARY KEY(id,revision)
);
--> statement-breakpoint
CREATE INDEX activity_location_gist ON m1_catalog.activity_revision USING gist(location);
--> statement-breakpoint
CREATE TABLE m1_simulation.actor (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('person','organization','government-body')),
 display_name text NOT NULL CHECK(length(trim(display_name))>0)
);
--> statement-breakpoint
CREATE TABLE m1_simulation.collaboration_case (
 id text PRIMARY KEY, mode text NOT NULL CHECK(mode='simulation'),
 activity_id text NOT NULL, activity_revision integer NOT NULL,
 revision integer NOT NULL CHECK(revision>0),
 stage text NOT NULL CHECK(stage IN ('draft','requested','coordinating','agreed','preparing')),
 FOREIGN KEY(activity_id,activity_revision) REFERENCES m1_catalog.activity_revision(id,revision)
);
--> statement-breakpoint
CREATE TABLE m1_simulation.case_party (
 case_id text REFERENCES m1_simulation.collaboration_case(id), actor_id text REFERENCES m1_simulation.actor(id),
 role text NOT NULL CHECK(length(trim(role))>0), PRIMARY KEY(case_id,actor_id)
);

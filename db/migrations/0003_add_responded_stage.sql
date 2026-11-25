-- 2026-11-25 owner decision: add the simulated 'responded' stage (requirements 5: request -> response -> coordination).
-- Forward-only change; replaces only the stage CHECK constraint. No table/schema drop, no data deletion.
DO $$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'simulation'
      AND t.relname = 'collaboration_case'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%stage%'
  LOOP
    EXECUTE format('ALTER TABLE simulation.collaboration_case DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE simulation.collaboration_case
  ADD CONSTRAINT collaboration_case_stage_check
  CHECK (stage IN ('draft', 'requested', 'responded', 'coordinating', 'agreed', 'preparing'));

-- Migration 005: stop `time_entries.start_time` from being overwritten on UPDATE.
--
-- Production's schema declared:
--   `start_time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
-- The `ON UPDATE current_timestamp()` clause resets start_time on EVERY row update
-- (clock-out, manual edit, invoice linkage), so a completed entry ended up with
-- start_time == end_time and duration_minutes = 0. The application always writes
-- start_time explicitly on clock-in, so the column must not auto-update.
--
-- Idempotent: re-running applies the same definition.
--
-- Run from scripts/ with: npm run migrate

ALTER TABLE time_entries
  MODIFY COLUMN start_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
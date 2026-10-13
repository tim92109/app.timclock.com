-- Migration 008: archive projects and time entries once their invoice is paid.
--
-- Marking an invoice paid leaves the project and its time entries around, which
-- clutters the active project and time tracking lists. Add an explicit archive
-- flag to both tables so the settlement path can hide the paid work without
-- deleting it. Idempotent: each ALTER runs only when the column is missing.
--
-- Run from scripts/ with: npm run migrate

-- projects.is_archived
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'is_archived'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects'
           AND INDEX_NAME = 'idx_projects_archived'),
  'SELECT 1',
  'CREATE INDEX idx_projects_archived ON projects (is_archived)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- projects.priority supports the project-list priority filter. The production
-- dump already ships idx_priority, so this is only needed on fresh installs.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects'
           AND INDEX_NAME = 'idx_priority'),
  'SELECT 1',
  'CREATE INDEX idx_priority ON projects (priority)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- time_entries.is_archived
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'is_archived'),
  'SELECT 1',
  'ALTER TABLE time_entries ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries'
           AND INDEX_NAME = 'idx_time_entries_archived'),
  'SELECT 1',
  'CREATE INDEX idx_time_entries_archived ON time_entries (is_archived)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

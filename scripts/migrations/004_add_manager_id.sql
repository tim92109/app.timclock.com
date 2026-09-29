-- Migration 004: add the self-signup manager role support column and the
-- manager -> employee team relationship.
--
-- A user's optional `manager_id` points at the user who manages them. Managers
-- attach employees to themselves; an admin may attach a user to any manager.
--
-- Idempotent: MySQL has no "ADD COLUMN IF NOT EXISTS" / "CREATE INDEX IF NOT
-- EXISTS", so each change is guarded through INFORMATION_SCHEMA and executed
-- through a prepared statement, matching 001_align_schema.sql.
--
-- Run from scripts/ with: npm run migrate

-- ---------------------------------------------------------------------------
-- users: optional reporting manager
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'manager_id'),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN manager_id INT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- users: index supporting team lookups by manager_id
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
           AND INDEX_NAME = 'idx_users_manager'),
  'SELECT 1',
  'CREATE INDEX idx_users_manager ON users (manager_id)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

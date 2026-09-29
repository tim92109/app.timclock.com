-- Migration 001: align schema with the columns and tables the API controllers use.
--
-- Idempotent: safe to run against both a fresh database (after setup-database.sql)
-- and an existing production database. MySQL has no "ADD COLUMN IF NOT EXISTS",
-- so each change is guarded through INFORMATION_SCHEMA and a prepared statement.
--
-- CANONICAL COLUMN NAMES FOLLOW PRODUCTION: time_entries uses `invoiced` and
-- `is_manual`. setup-database.sql is newer and calls the same columns `billed`
-- and `entry_type`; this migration reconciles a fresh install to the production
-- names rather than the other way around, so the shared database and any other
-- consumer that references `invoiced`/`is_manual` keep working.
--
-- Run from scripts/ with: npm run migrate   (or as part of: npm run setup-db)

-- ---------------------------------------------------------------------------
-- users: production predates the `phone` column used by register/profile
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- clients: add columns referenced by client/billing controllers
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'billing_address'),
  'SELECT 1',
  'ALTER TABLE clients ADD COLUMN billing_address TEXT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'tax_id'),
  'SELECT 1',
  'ALTER TABLE clients ADD COLUMN tax_id VARCHAR(50) DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Production clients has no created_by; the API now records the author.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'created_by'),
  'SELECT 1',
  'ALTER TABLE clients ADD COLUMN created_by INT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- projects: add columns referenced by project/client/billing controllers
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'actual_hours'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN actual_hours DECIMAL(10,2) DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'completed_date'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN completed_date DATE DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'invoice_date'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN invoice_date DATE DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'payment_date'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN payment_date DATE DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'notes'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN notes TEXT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'template_id'),
  'SELECT 1',
  'ALTER TABLE projects ADD COLUMN template_id INT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- time_entries: reconcile fresh-install names to production names and add the
-- indexes the controllers rely on.
-- ---------------------------------------------------------------------------

-- Fresh installs name the flag `billed`; production uses `invoiced`.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'billed')
  AND NOT EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'invoiced'),
  'ALTER TABLE time_entries CHANGE COLUMN billed invoiced TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure the production flag exists on fresh installs that never had `billed`.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'invoiced'),
  'SELECT 1',
  'ALTER TABLE time_entries ADD COLUMN invoiced TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure the production manual-entry flag exists.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'is_manual'),
  'SELECT 1',
  'ALTER TABLE time_entries ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill is_manual from the fresh-install `entry_type` enum when present.
-- The WHERE clause keeps the statement bounded: only rows whose value actually
-- differs are rewritten, so re-running the migration is a no-op on unchanged rows.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'entry_type'),
  "UPDATE time_entries SET is_manual = CASE WHEN entry_type = 'manual' THEN 1 ELSE 0 END
   WHERE is_manual <> (entry_type = 'manual')",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill invoice linkage for freshly created installs: no-op where the
-- column already exists or is unused.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'invoice_id'),
  'SELECT 1',
  'ALTER TABLE time_entries ADD COLUMN invoice_id INT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries' AND COLUMN_NAME = 'task_id'),
  'SELECT 1',
  'ALTER TABLE time_entries ADD COLUMN task_id INT DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index supporting the billable-projects aggregation, whose join filters on
-- project_id, billable and invoiced. MySQL has no "CREATE INDEX IF NOT EXISTS",
-- so guard on INFORMATION_SCHEMA.STATISTICS and use a prepared statement.
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'time_entries'
           AND INDEX_NAME = 'idx_time_project_billable_invoiced'),
  'SELECT 1',
  'CREATE INDEX idx_time_project_billable_invoiced ON time_entries (project_id, billable, invoiced)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- tasks (present in production; created for fresh installs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    estimated_hours DECIMAL(8,2) DEFAULT NULL,
    actual_hours DECIMAL(8,2) DEFAULT 0,
    assigned_to INT DEFAULT NULL,
    due_date DATE DEFAULT NULL,
    completed_date DATE DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_task_project (project_id),
    INDEX idx_task_status (status),
    INDEX idx_task_assigned (assigned_to)
);

-- ---------------------------------------------------------------------------
-- project_templates (present in production; created for fresh installs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    estimated_hours DECIMAL(8,2) DEFAULT NULL,
    default_hourly_rate DECIMAL(10,2) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_template_active (is_active)
);

-- ---------------------------------------------------------------------------
-- payments (required by recordPayment/mark-paid; absent from production)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    reference VARCHAR(100) DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    created_by INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_payment_invoice (invoice_id),
    INDEX idx_payment_date (payment_date)
);

-- ---------------------------------------------------------------------------
-- billing_rates (required by the billing rate endpoints; absent from production)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rate DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    user_id INT DEFAULT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_rate_user (user_id),
    INDEX idx_rate_active (is_active)
);
-- Migration 006: invoice discounts.
--
-- Adds the optional discount columns used by create/update invoice and the PDF
-- renderer. Idempotent: MySQL has no "ADD COLUMN IF NOT EXISTS", so each change
-- is guarded through INFORMATION_SCHEMA and a prepared statement, matching the
-- pattern in 001_align_schema.sql. Safe to run repeatedly.
--
-- Run from scripts/ with: npm run migrate

-- ---------------------------------------------------------------------------
-- invoices.discount_type: 'amount' (fixed) or 'percent' (of subtotal)
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'discount_type'),
  'SELECT 1',
  "ALTER TABLE invoices ADD COLUMN discount_type ENUM('amount','percent') NOT NULL DEFAULT 'amount'"
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- invoices.discount_value: the raw entered value (fixed amount or percent)
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'discount_value'),
  'SELECT 1',
  'ALTER TABLE invoices ADD COLUMN discount_value DECIMAL(10,2) NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- invoices.discount_amount: the computed, clamped discount applied to subtotal
-- ---------------------------------------------------------------------------
SET @sql = IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'discount_amount'),
  'SELECT 1',
  'ALTER TABLE invoices ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

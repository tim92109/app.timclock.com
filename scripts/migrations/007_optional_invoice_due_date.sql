-- Migration 007: make invoices.due_date optional.
--
-- The create-invoice form labels the due date as optional, but the column was
-- NOT NULL and the controller always defaulted it to one month after the issue
-- date. Allow NULL so an invoice without a due date can be stored. Idempotent:
-- the ALTER only runs when the column still rejects NULL. Safe to run
-- repeatedly.
--
-- Run from scripts/ with: npm run migrate

SET @sql = IF(
  (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'due_date') = 'YES',
  'SELECT 1',
  'ALTER TABLE invoices MODIFY COLUMN due_date DATE NULL DEFAULT NULL'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

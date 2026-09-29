-- Migration 003: add the `contractor` user role.
--
-- A contractor is a solo operator: manager-like abilities over their own data,
-- but no team/user management. This migration only extends the enum so the role
-- can be stored; route authorization and data scoping are handled elsewhere.
--
-- Idempotent: ALTER TABLE ... MODIFY COLUMN to the same definition is a no-op,
-- so this is safe to run repeatedly.
--
-- Run from scripts/ with: npm run migrate

ALTER TABLE users MODIFY COLUMN role ENUM('admin','manager','employee','contractor') DEFAULT 'employee';

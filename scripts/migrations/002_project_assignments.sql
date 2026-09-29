-- Migration 002: (re)create project_assignments for multi-assignee support.
--
-- `projects.assigned_to` stays meaningful as the "lead" assignee for backward
-- compatibility, but project_assignments is the many-to-many source of truth:
-- an employee has access to a project when they are the lead, the creator, or
-- have a row here.
--
-- This table was previously defined and then removed, so it is re-created here.
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to run repeatedly.
--
-- Run from scripts/ with: npm run migrate

CREATE TABLE IF NOT EXISTS project_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('assigned','manager','viewer') DEFAULT 'assigned',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_project_user (project_id, user_id),
  INDEX idx_assignment_user (user_id)
);

-- TimeClock Database Setup
-- Run this script to create the database and tables

CREATE DATABASE IF NOT EXISTS timeclock_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE timeclock_db;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    role ENUM('admin', 'manager', 'employee') DEFAULT 'employee',
    hourly_rate DECIMAL(10,2) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    company VARCHAR(100) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    hourly_rate DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_terms INT DEFAULT 30,
    notes TEXT DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_name (name),
    INDEX idx_email (email),
    INDEX idx_active (is_active)
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    client_id INT NOT NULL,
    status ENUM('open', 'active', 'complete', 'invoice_sent', 'paid', 'cancelled') DEFAULT 'open',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    billing_type ENUM('hourly', 'fixed', 'milestone') DEFAULT 'hourly',
    estimated_hours DECIMAL(8,2) DEFAULT NULL,
    hourly_rate DECIMAL(10,2) DEFAULT NULL,
    fixed_price DECIMAL(10,2) DEFAULT NULL,
    start_date DATE DEFAULT NULL,
    due_date DATE DEFAULT NULL,
    assigned_to INT DEFAULT NULL,
    created_by INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_name (name),
    INDEX idx_client (client_id),
    INDEX idx_status (status),
    INDEX idx_assigned (assigned_to),
    INDEX idx_active (is_active)
);

-- Time entries table
CREATE TABLE IF NOT EXISTS time_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id INT NOT NULL,
    task_id INT DEFAULT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP DEFAULT NULL,
    duration_minutes INT DEFAULT NULL,
    description TEXT DEFAULT NULL,
    hourly_rate DECIMAL(10,2) DEFAULT NULL,
    billable BOOLEAN DEFAULT TRUE,
    billed BOOLEAN DEFAULT FALSE,
    invoice_id INT DEFAULT NULL,
    entry_type ENUM('automatic', 'manual') DEFAULT 'automatic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    INDEX idx_user (user_id),
    INDEX idx_project (project_id),
    INDEX idx_start_time (start_time),
    INDEX idx_billable (billable),
    INDEX idx_billed (billed)
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    client_id INT NOT NULL,
    project_id INT DEFAULT NULL,
    status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    paid_date DATE DEFAULT NULL,
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    tax_amount DECIMAL(10,2) DEFAULT 0.00,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    notes TEXT DEFAULT NULL,
    terms TEXT DEFAULT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    INDEX idx_invoice_number (invoice_number),
    INDEX idx_client (client_id),
    INDEX idx_status (status),
    INDEX idx_issue_date (issue_date)
);

-- Invoice items table
CREATE TABLE IF NOT EXISTS invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    time_entry_id INT DEFAULT NULL,
    description TEXT NOT NULL,
    quantity DECIMAL(8,2) NOT NULL,
    rate DECIMAL(10,2) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id),
    INDEX idx_invoice (invoice_id)
);

-- Create default admin user (password: admin123)
INSERT IGNORE INTO users (username, email, password_hash, first_name, last_name, role) 
VALUES (
    'admin', 
    'admin@timeclock.com', 
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm', 
    'Admin', 
    'User', 
    'admin'
);

-- Create sample client
INSERT IGNORE INTO clients (name, company, email, hourly_rate, created_by) 
VALUES (
    'John Doe', 
    'Sample Company', 
    'john@example.com', 
    75.00, 
    1
);

-- Create sample project
INSERT IGNORE INTO projects (name, description, client_id, hourly_rate, created_by, assigned_to) 
VALUES (
    'Sample Project', 
    'This is a sample project for testing', 
    1, 
    75.00, 
    1, 
    1
);
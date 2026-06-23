/**
 * Application Constants
 * Centralized constants for the TimeClock API
 */

// User Roles
const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee'
};

// Project Status
const PROJECT_STATUS = {
  OPEN: 'open',
  ACTIVE: 'active',
  COMPLETE: 'complete',
  INVOICE_SENT: 'invoice_sent',
  PAID: 'paid',
  CANCELLED: 'cancelled'
};

// Project Priority
const PROJECT_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// Task Status
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Invoice Status
const INVOICE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled'
};

// Billing Types
const BILLING_TYPES = {
  HOURLY: 'hourly',
  FIXED: 'fixed',
  MILESTONE: 'milestone'
};

// Time Entry Types
const TIME_ENTRY_TYPES = {
  AUTOMATIC: 'automatic',
  MANUAL: 'manual'
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Error Codes
const ERROR_CODES = {
  // Authentication Errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCESS_DENIED: 'ACCESS_DENIED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  
  // Validation Errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  
  // Resource Errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  
  // Time Tracking Errors
  ALREADY_CLOCKED_IN: 'ALREADY_CLOCKED_IN',
  NOT_CLOCKED_IN: 'NOT_CLOCKED_IN',
  INVALID_TIME_RANGE: 'INVALID_TIME_RANGE',
  TIME_OVERLAP: 'TIME_OVERLAP',
  
  // Project Errors
  PROJECT_INACTIVE: 'PROJECT_INACTIVE',
  PROJECT_COMPLETED: 'PROJECT_COMPLETED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // System Errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

// Success Messages
const SUCCESS_MESSAGES = {
  USER_CREATED: 'User created successfully',
  USER_UPDATED: 'User updated successfully',
  USER_DELETED: 'User deleted successfully',
  LOGIN_SUCCESS: 'Login successful',
  LOGOUT_SUCCESS: 'Logout successful',
  
  CLIENT_CREATED: 'Client created successfully',
  CLIENT_UPDATED: 'Client updated successfully',
  CLIENT_DELETED: 'Client deleted successfully',
  
  PROJECT_CREATED: 'Project created successfully',
  PROJECT_UPDATED: 'Project updated successfully',
  PROJECT_DELETED: 'Project deleted successfully',
  
  TIME_ENTRY_CREATED: 'Time entry created successfully',
  TIME_ENTRY_UPDATED: 'Time entry updated successfully',
  TIME_ENTRY_DELETED: 'Time entry deleted successfully',
  CLOCK_IN_SUCCESS: 'Clocked in successfully',
  CLOCK_OUT_SUCCESS: 'Clocked out successfully',
  
  INVOICE_CREATED: 'Invoice created successfully',
  INVOICE_UPDATED: 'Invoice updated successfully',
  INVOICE_SENT: 'Invoice sent successfully',
  INVOICE_PAID: 'Invoice marked as paid'
};

// Date/Time Formats
const DATE_FORMATS = {
  ISO_DATE: 'YYYY-MM-DD',
  ISO_DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DISPLAY_DATE: 'MMM DD, YYYY',
  DISPLAY_DATETIME: 'MMM DD, YYYY HH:mm',
  TIME_ONLY: 'HH:mm:ss'
};

// Pagination Defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1
};

// File Upload Limits
const FILE_LIMITS = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt']
};

// Time Tracking Limits
const TIME_LIMITS = {
  MIN_ENTRY_MINUTES: 1,
  MAX_ENTRY_HOURS: 24,
  AUTO_LOGOUT_MINUTES: 480, // 8 hours
  BREAK_THRESHOLD_HOURS: 6
};

// Currency Codes
const CURRENCIES = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  CAD: 'CAD',
  AUD: 'AUD',
  JPY: 'JPY'
};

// Email Templates
const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  PASSWORD_RESET: 'password_reset',
  INVOICE_SENT: 'invoice_sent',
  PROJECT_ASSIGNED: 'project_assigned',
  TIME_REMINDER: 'time_reminder'
};

// System Settings Keys
const SYSTEM_SETTINGS = {
  COMPANY_NAME: 'company_name',
  COMPANY_EMAIL: 'company_email',
  COMPANY_PHONE: 'company_phone',
  COMPANY_ADDRESS: 'company_address',
  DEFAULT_CURRENCY: 'default_currency',
  DEFAULT_TAX_RATE: 'default_tax_rate',
  INVOICE_PREFIX: 'invoice_prefix',
  INVOICE_TERMS: 'invoice_terms',
  TIME_FORMAT: 'time_format',
  DATE_FORMAT: 'date_format',
  TIMEZONE: 'timezone'
};

// API Response Formats
const API_RESPONSE = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

module.exports = {
  USER_ROLES,
  PROJECT_STATUS,
  PROJECT_PRIORITY,
  TASK_STATUS,
  INVOICE_STATUS,
  BILLING_TYPES,
  TIME_ENTRY_TYPES,
  HTTP_STATUS,
  ERROR_CODES,
  SUCCESS_MESSAGES,
  DATE_FORMATS,
  PAGINATION,
  FILE_LIMITS,
  TIME_LIMITS,
  CURRENCIES,
  EMAIL_TEMPLATES,
  SYSTEM_SETTINGS,
  API_RESPONSE
};
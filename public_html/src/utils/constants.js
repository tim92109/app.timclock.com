// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
};

// Project statuses
export const PROJECT_STATUSES = {
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'complete',
  CANCELLED: 'cancelled',
};

// Project priorities
export const PROJECT_PRIORITIES = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

// Invoice statuses
export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
};

// Billing types
export const BILLING_TYPES = {
  HOURLY: 'hourly',
  FIXED: 'fixed',
  RETAINER: 'retainer',
};

// Role configuration with colors and labels
export const ROLE_CONFIG = {
  [USER_ROLES.ADMIN]: {
    label: 'Administrator',
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
  [USER_ROLES.MANAGER]: {
    label: 'Manager',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  [USER_ROLES.EMPLOYEE]: {
    label: 'Employee',
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
};

// Status configuration with colors
export const STATUS_CONFIG = {
  [PROJECT_STATUSES.ACTIVE]: {
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  [PROJECT_STATUSES.ON_HOLD]: {
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
  },
  [PROJECT_STATUSES.COMPLETED]: {
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  [PROJECT_STATUSES.CANCELLED]: {
    bgColor: 'bg-red-100',
    textColor: 'text-red-800',
  },
};

// Navigation items based on user roles
export const getNavigationItems = (userRole) => {
  const baseItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
    },
    {
      name: 'Time Tracking',
      href: '/time',
      icon: 'Clock',
    },
    {
      name: 'Projects',
      href: '/projects',
      icon: 'FolderOpen',
    },
  ];

  const managerItems = [
    {
      name: 'Clients',
      href: '/clients',
      icon: 'Users',
    },
    {
      name: 'Billing',
      href: '/billing',
      icon: 'DollarSign',
    },
  ];

  if (userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.MANAGER) {
    return [...baseItems, ...managerItems];
  }

  return baseItems;
};

// API endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  PROFILE: '/auth/profile',
  CHANGE_PASSWORD: '/auth/change-password',

  // Dashboard
  DASHBOARD: '/dashboard',

  // Clients
  CLIENTS: '/clients',
  CLIENT_DETAIL: (id) => `/clients/${id}`,
  CLIENT_PROJECTS: (id) => `/clients/${id}/projects`,
  CLIENT_TIME: (id) => `/clients/${id}/time`,
  CLIENT_INVOICES: (id) => `/clients/${id}/invoices`,

  // Projects
  PROJECTS: '/projects',
  PROJECT_DETAIL: (id) => `/projects/${id}`,
  PROJECT_TASKS: (id) => `/projects/${id}/tasks`,
  PROJECT_TIME: (id) => `/projects/${id}/time`,

  // Time tracking
  TIME_ENTRIES: '/time',
  TIME_START: '/time/start',
  TIME_STOP: '/time/stop',
  TIME_ACTIVE: '/time/active',
  TIME_EXPORT: '/time/export',

  // Billing
  INVOICES: '/billing/invoices',
  INVOICE_DETAIL: (id) => `/billing/invoices/${id}`,
  INVOICE_SEND: (id) => `/billing/invoices/${id}/send`,
  INVOICE_MARK_PAID: (id) => `/billing/invoices/${id}/mark-paid`,
  INVOICE_DOWNLOAD: (id) => `/billing/invoices/${id}/download`,
  BILLING_SUMMARY: '/billing/summary',
};

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM d, yyyy',
  DISPLAY_WITH_TIME: 'MMM d, yyyy h:mm a',
  INPUT: 'yyyy-MM-dd',
  INPUT_WITH_TIME: "yyyy-MM-dd'T'HH:mm",
  TIME_ONLY: 'h:mm a',
};

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
};

// File upload limits
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
};

// Timer settings
export const TIMER_SETTINGS = {
  UPDATE_INTERVAL: 1000, // 1 second
  IDLE_WARNING_TIME: 5 * 60 * 1000, // 5 minutes
  AUTO_STOP_TIME: 15 * 60 * 1000, // 15 minutes
};

// Currency settings
export const CURRENCY = {
  DEFAULT: 'USD',
  SYMBOL: '$',
  DECIMAL_PLACES: 2,
};

// Time formats
export const TIME_FORMATS = {
  DECIMAL: 'decimal', // 1.5 hours
  HOURS_MINUTES: 'hm', // 1h 30m
  TOTAL_MINUTES: 'minutes', // 90 minutes
};

// Default values
export const DEFAULTS = {
  HOURLY_RATE: 0,
  PROJECT_STATUS: PROJECT_STATUSES.ACTIVE,
  PROJECT_PRIORITY: PROJECT_PRIORITIES.MEDIUM,
  INVOICE_STATUS: INVOICE_STATUSES.DRAFT,
  USER_ROLE: USER_ROLES.EMPLOYEE,
};

// Validation rules
export const VALIDATION = {
  PASSWORD_MIN_LENGTH: 6,
  NAME_MIN_LENGTH: 2,
  NAME_MAX_LENGTH: 50,
  EMAIL_MAX_LENGTH: 255,
  DESCRIPTION_MAX_LENGTH: 1000,
  TASK_TITLE_MAX_LENGTH: 200,
};

// Local storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'timeclock_auth_token',
  REFRESH_TOKEN: 'timeclock_refresh_token',
  USER_PREFERENCES: 'timeclock_user_preferences',
  THEME: 'timeclock_theme',
};

// Theme options
export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

// Notification types
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Export all constants as default
export default {
  USER_ROLES,
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  INVOICE_STATUSES,
  BILLING_TYPES,
  ROLE_CONFIG,
  STATUS_CONFIG,
  getNavigationItems,
  API_ENDPOINTS,
  DATE_FORMATS,
  PAGINATION,
  FILE_UPLOAD,
  TIMER_SETTINGS,
  CURRENCY,
  TIME_FORMATS,
  DEFAULTS,
  VALIDATION,
  STORAGE_KEYS,
  THEMES,
  NOTIFICATION_TYPES,
};
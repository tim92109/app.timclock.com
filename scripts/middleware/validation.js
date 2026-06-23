/**
 * Validation Middleware
 * Input validation using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');
const { ValidationError } = require('./errorHandler');
const { USER_ROLES, PROJECT_STATUS, INVOICE_STATUS, BILLING_TYPES } = require('../utils/constants');
const { isValidEmail, isValidPhone } = require('../utils/helpers');

/**
 * Handle validation errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    
    throw new ValidationError('Validation failed', formattedErrors);
  }
  
  next();
};

// Common validation rules
const commonValidations = {
  id: param('id').isInt({ min: 1 }).withMessage('ID must be a positive integer'),
  
  email: body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
    
  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
    
  phone: body('phone')
    .optional()
    .custom((value) => {
      if (value && !isValidPhone(value)) {
        throw new Error('Invalid phone number format');
      }
      return true;
    }),
    
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ],
  
  dateRange: [
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Start date must be in ISO 8601 format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('End date must be in ISO 8601 format')
  ]
};

// User validation rules
const userValidations = {
  register: [
    body('username')
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    commonValidations.email,
    commonValidations.password,
    body('first_name')
      .isLength({ min: 1, max: 50 })
      .withMessage('First name is required and must be less than 50 characters'),
    body('last_name')
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name is required and must be less than 50 characters'),
    body('role')
      .optional()
      .isIn(Object.values(USER_ROLES))
      .withMessage(`Role must be one of: ${Object.values(USER_ROLES).join(', ')}`),
    body('hourly_rate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Hourly rate must be a positive number'),
    commonValidations.phone
  ],
  
  login: [
    body('username')
      .notEmpty()
      .withMessage('Username or email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  
  update: [
    commonValidations.id,
    body('username')
      .optional()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    body('first_name')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('First name must be less than 50 characters'),
    body('last_name')
      .optional()
      .isLength({ min: 1, max: 50 })
      .withMessage('Last name must be less than 50 characters'),
    body('hourly_rate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Hourly rate must be a positive number'),
    commonValidations.phone
  ]
};

// Client validation rules
const clientValidations = {
  create: [
    body('name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Client name is required and must be less than 100 characters'),
    body('company')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Company name must be less than 100 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    commonValidations.phone,
    body('hourly_rate')
      .isFloat({ min: 0 })
      .withMessage('Hourly rate is required and must be a positive number'),
    body('currency')
      .optional()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-letter code'),
    body('payment_terms')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Payment terms must be a positive integer')
  ],
  
  update: [
    commonValidations.id,
    body('name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Client name must be less than 100 characters'),
    body('company')
      .optional()
      .isLength({ max: 100 })
      .withMessage('Company name must be less than 100 characters'),
    body('email')
      .optional()
      .isEmail()
      .normalizeEmail()
      .withMessage('Valid email is required'),
    commonValidations.phone,
    body('hourly_rate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Hourly rate must be a positive number'),
    body('currency')
      .optional()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-letter code')
  ]
};

// Project validation rules
const projectValidations = {
  create: [
    body('name')
      .isLength({ min: 1, max: 100 })
      .withMessage('Project name is required and must be less than 100 characters'),
    body('client_id')
      .isInt({ min: 1 })
      .withMessage('Valid client ID is required'),
    body('template_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Template ID must be a positive integer'),
    body('estimated_hours')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Estimated hours must be a positive number'),
    body('hourly_rate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Hourly rate must be a positive number'),
    body('fixed_price')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Fixed price must be a positive number'),
    body('billing_type')
      .optional()
      .isIn(Object.values(BILLING_TYPES))
      .withMessage(`Billing type must be one of: ${Object.values(BILLING_TYPES).join(', ')}`),
    body('start_date')
      .optional()
      .isISO8601()
      .withMessage('Start date must be in ISO 8601 format'),
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be in ISO 8601 format'),
    body('assigned_to')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Assigned user ID must be a positive integer')
  ],
  
  update: [
    commonValidations.id,
    body('name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Project name must be less than 100 characters'),
    body('status')
      .optional()
      .isIn(Object.values(PROJECT_STATUS))
      .withMessage(`Status must be one of: ${Object.values(PROJECT_STATUS).join(', ')}`),
    body('estimated_hours')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Estimated hours must be a positive number'),
    body('hourly_rate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Hourly rate must be a positive number'),
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be in ISO 8601 format')
  ]
};

// Time entry validation rules
const timeEntryValidations = {
  clockIn: [
    body('project_id')
      .isInt({ min: 1 })
      .withMessage('Valid project ID is required'),
    body('task_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Task ID must be a positive integer'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
  ],
  
  clockOut: [
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters')
  ],
  
  create: [
    body('project_id')
      .isInt({ min: 1 })
      .withMessage('Valid project ID is required'),
    body('start_time')
      .isISO8601()
      .withMessage('Start time is required and must be in ISO 8601 format'),
    body('end_time')
      .isISO8601()
      .withMessage('End time is required and must be in ISO 8601 format'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('hourly_rate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Hourly rate must be a positive number'),
    body('billable')
      .optional()
      .isBoolean()
      .withMessage('Billable must be a boolean value')
  ],
  
  update: [
    commonValidations.id,
    body('start_time')
      .optional()
      .isISO8601()
      .withMessage('Start time must be in ISO 8601 format'),
    body('end_time')
      .optional()
      .isISO8601()
      .withMessage('End time must be in ISO 8601 format'),
    body('description')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('billable')
      .optional()
      .isBoolean()
      .withMessage('Billable must be a boolean value')
  ]
};

// Invoice validation rules
const invoiceValidations = {
  create: [
    body('client_id')
      .isInt({ min: 1 })
      .withMessage('Valid client ID is required'),
    body('project_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Project ID must be a positive integer'),
    body('issue_date')
      .isISO8601()
      .withMessage('Issue date is required and must be in ISO 8601 format'),
    body('due_date')
      .isISO8601()
      .withMessage('Due date is required and must be in ISO 8601 format'),
    body('tax_rate')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Tax rate must be between 0 and 100'),
    body('currency')
      .optional()
      .isLength({ min: 3, max: 3 })
      .withMessage('Currency must be a 3-letter code')
  ],
  
  update: [
    commonValidations.id,
    body('status')
      .optional()
      .isIn(Object.values(INVOICE_STATUS))
      .withMessage(`Status must be one of: ${Object.values(INVOICE_STATUS).join(', ')}`),
    body('due_date')
      .optional()
      .isISO8601()
      .withMessage('Due date must be in ISO 8601 format'),
    body('paid_date')
      .optional()
      .isISO8601()
      .withMessage('Paid date must be in ISO 8601 format')
  ]
};

// Dashboard validation rules
const dashboardValidations = {
  timeReport: [
    ...commonValidations.dateRange,
    query('user_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('User ID must be a positive integer'),
    query('project_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Project ID must be a positive integer'),
    query('client_id')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Client ID must be a positive integer')
  ]
};

// Export individual validation middleware functions
const validateUser = [...userValidations.register, handleValidationErrors];
const validateUserUpdate = [...userValidations.update, handleValidationErrors];
const validateLogin = [...userValidations.login, handleValidationErrors];

const validateClient = [...clientValidations.create, handleValidationErrors];
const validateClientUpdate = [...clientValidations.update, handleValidationErrors];

const validateProject = [...projectValidations.create, handleValidationErrors];
const validateProjectUpdate = [...projectValidations.update, handleValidationErrors];

// Project assignment validation
const validateProjectAssignment = [
  body('user_id')
    .isInt({ min: 1 })
    .withMessage('Valid user ID is required'),
  body('role')
    .optional()
    .isIn(['assigned', 'manager', 'viewer'])
    .withMessage('Role must be one of: assigned, manager, viewer'),
  handleValidationErrors
];

const validateTimeEntry = [...timeEntryValidations.create, handleValidationErrors];
const validateTimeEntryUpdate = [...timeEntryValidations.update, handleValidationErrors];
const validateClockIn = [...timeEntryValidations.clockIn, handleValidationErrors];
const validateClockOut = [...timeEntryValidations.clockOut, handleValidationErrors];

const validateInvoice = [...invoiceValidations.create, handleValidationErrors];
const validateInvoiceUpdate = [...invoiceValidations.update, handleValidationErrors];

const validateTimeReport = [...dashboardValidations.timeReport, handleValidationErrors];

// Alias for clock actions (used by timeEntries routes)
const validateClockAction = validateClockIn;

// Payment validation
const validatePayment = [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Payment amount must be greater than 0'),
  body('payment_date')
    .isISO8601()
    .withMessage('Payment date must be in ISO 8601 format'),
  body('payment_method')
    .isLength({ min: 1, max: 50 })
    .withMessage('Payment method is required and must be less than 50 characters'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters'),
  handleValidationErrors
];

module.exports = {
  handleValidationErrors,
  commonValidations,
  userValidations,
  clientValidations,
  projectValidations,
  timeEntryValidations,
  invoiceValidations,
  dashboardValidations,
  
  // Individual validation middleware
  validateUser,
  validateUserUpdate,
  validateLogin,
  validateClient,
  validateClientUpdate,
  validateProject,
  validateProjectUpdate,
  validateProjectAssignment,
  validateTimeEntry,
  validateTimeEntryUpdate,
  validateClockIn,
  validateClockOut,
  validateClockAction,
  validateInvoice,
  validateInvoiceUpdate,
  validatePayment,
  validateTimeReport
};
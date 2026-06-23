/**
 * Utility Helper Functions
 * Common utility functions used throughout the application
 */

const moment = require('moment');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { DATE_FORMATS, TIME_LIMITS, CURRENCIES } = require('./constants');

/**
 * Format date using moment.js
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string
 * @returns {string} Formatted date
 */
const formatDate = (date, format = DATE_FORMATS.ISO_DATETIME) => {
  if (!date) return null;
  return moment(date).format(format);
};

/**
 * Calculate duration between two dates in minutes
 * @param {Date|string} startTime - Start time
 * @param {Date|string} endTime - End time
 * @returns {number} Duration in minutes
 */
const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const start = moment(startTime);
  const end = moment(endTime);
  return end.diff(start, 'minutes');
};

/**
 * Convert minutes to hours and minutes format
 * @param {number} minutes - Minutes to convert
 * @returns {Object} Hours and minutes object
 */
const minutesToHoursMinutes = (minutes) => {
  if (!minutes || minutes < 0) return { hours: 0, minutes: 0 };
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return { hours, minutes: remainingMinutes };
};

/**
 * Format duration for display
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration string
 */
const formatDuration = (minutes) => {
  const { hours, minutes: mins } = minutesToHoursMinutes(minutes);
  
  if (hours === 0) {
    return `${mins}m`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}m`;
  }
};

/**
 * Calculate billable amount
 * @param {number} minutes - Duration in minutes
 * @param {number} hourlyRate - Hourly rate
 * @returns {number} Billable amount
 */
const calculateBillableAmount = (minutes, hourlyRate) => {
  if (!minutes || !hourlyRate) return 0;
  const hours = minutes / 60;
  return parseFloat((hours * hourlyRate).toFixed(2));
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Is valid phone number
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
};

/**
 * Generate unique invoice number
 * @param {string} prefix - Invoice prefix
 * @param {number} length - Number length
 * @returns {string} Invoice number
 */
const generateInvoiceNumber = (prefix = 'INV', length = 6) => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * Math.pow(10, length - 6)).toString().padStart(length - 6, '0');
  return `${prefix}-${timestamp}${random}`;
};

/**
 * Generate secure random token
 * @param {number} length - Token length
 * @returns {string} Random token
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate UUID
 * @returns {string} UUID
 */
const generateUUID = () => {
  return uuidv4();
};

/**
 * Sanitize string for database storage
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
};

/**
 * Validate time range
 * @param {Date|string} startTime - Start time
 * @param {Date|string} endTime - End time
 * @returns {Object} Validation result
 */
const validateTimeRange = (startTime, endTime) => {
  const start = moment(startTime);
  const end = moment(endTime);
  
  if (!start.isValid() || !end.isValid()) {
    return { isValid: false, error: 'Invalid date format' };
  }
  
  if (end.isBefore(start)) {
    return { isValid: false, error: 'End time cannot be before start time' };
  }
  
  const duration = end.diff(start, 'minutes');
  
  if (duration < TIME_LIMITS.MIN_ENTRY_MINUTES) {
    return { isValid: false, error: `Minimum time entry is ${TIME_LIMITS.MIN_ENTRY_MINUTES} minute(s)` };
  }
  
  if (duration > TIME_LIMITS.MAX_ENTRY_HOURS * 60) {
    return { isValid: false, error: `Maximum time entry is ${TIME_LIMITS.MAX_ENTRY_HOURS} hours` };
  }
  
  return { isValid: true, duration };
};

/**
 * Check if time ranges overlap
 * @param {Object} range1 - First time range
 * @param {Object} range2 - Second time range
 * @returns {boolean} Do ranges overlap
 */
const timeRangesOverlap = (range1, range2) => {
  const start1 = moment(range1.start);
  const end1 = moment(range1.end);
  const start2 = moment(range2.start);
  const end2 = moment(range2.end);
  
  return start1.isBefore(end2) && start2.isBefore(end1);
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted currency string
 */
const formatCurrency = (amount, currency = CURRENCIES.USD) => {
  if (typeof amount !== 'number') return '0.00';
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return formatter.format(amount);
};

/**
 * Parse pagination parameters
 * @param {Object} query - Query parameters
 * @returns {Object} Pagination object
 */
const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
};

/**
 * Build pagination response
 * @param {Array} data - Data array
 * @param {number} total - Total count
 * @param {Object} pagination - Pagination parameters
 * @returns {Object} Paginated response
 */
const buildPaginatedResponse = (data, total, pagination) => {
  const { page, limit } = pagination;
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

/**
 * Deep clone object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Remove undefined/null values from object
 * @param {Object} obj - Object to clean
 * @returns {Object} Cleaned object
 */
const removeEmptyValues = (obj) => {
  const cleaned = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
};

/**
 * Sleep function for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise} Promise with retry logic
 */
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await sleep(delay);
    }
  }
};

module.exports = {
  formatDate,
  calculateDuration,
  minutesToHoursMinutes,
  formatDuration,
  calculateBillableAmount,
  isValidEmail,
  isValidPhone,
  generateInvoiceNumber,
  generateToken,
  generateUUID,
  sanitizeString,
  validateTimeRange,
  timeRangesOverlap,
  formatCurrency,
  parsePagination,
  buildPaginatedResponse,
  deepClone,
  removeEmptyValues,
  sleep,
  retryWithBackoff
};
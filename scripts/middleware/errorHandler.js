/**
 * Error Handling Middleware
 * Centralized error handling for the API
 */

const { HTTP_STATUS, ERROR_CODES, API_RESPONSE } = require('../utils/constants');

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errorCode = ERROR_CODES.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error class
 */
class ValidationError extends APIError {
  constructor(message, details = null) {
    super(message, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

/**
 * Authentication Error class
 */
class AuthenticationError extends APIError {
  constructor(message = 'Authentication failed') {
    super(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization Error class
 */
class AuthorizationError extends APIError {
  constructor(message = 'Access denied') {
    super(message, HTTP_STATUS.FORBIDDEN, ERROR_CODES.ACCESS_DENIED);
    this.name = 'AuthorizationError';
  }
}

/**
 * Not Found Error class
 */
class NotFoundError extends APIError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, HTTP_STATUS.NOT_FOUND, ERROR_CODES.RESOURCE_NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/**
 * Conflict Error class
 */
class ConflictError extends APIError {
  constructor(message = 'Resource conflict') {
    super(message, HTTP_STATUS.CONFLICT, ERROR_CODES.RESOURCE_CONFLICT);
    this.name = 'ConflictError';
  }
}

/**
 * Database Error class
 */
class DatabaseError extends APIError {
  constructor(message = 'Database operation failed') {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.DATABASE_ERROR);
    this.name = 'DatabaseError';
  }
}

/**
 * Handle MySQL errors
 * @param {Error} error - MySQL error
 * @returns {APIError} Formatted API error
 */
const handleMySQLError = (error) => {
  console.error('MySQL Error:', error);
  
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      const field = extractDuplicateField(error.message);
      return new ConflictError(`${field} already exists`);
      
    case 'ER_NO_REFERENCED_ROW_2':
      return new ValidationError('Referenced record does not exist');
      
    case 'ER_ROW_IS_REFERENCED_2':
      return new ConflictError('Cannot delete record - it is referenced by other records');
      
    case 'ER_BAD_FIELD_ERROR':
      return new ValidationError('Invalid field in query');
      
    case 'ER_PARSE_ERROR':
      return new DatabaseError('SQL syntax error');
      
    case 'ECONNREFUSED':
      return new DatabaseError('Database connection refused');
      
    case 'ER_ACCESS_DENIED_ERROR':
      return new DatabaseError('Database access denied');
      
    default:
      return new DatabaseError('Database operation failed');
  }
};

/**
 * Extract duplicate field from MySQL error message
 * @param {string} message - Error message
 * @returns {string} Field name
 */
const extractDuplicateField = (message) => {
  const match = message.match(/for key '(\w+)'/);
  if (match) {
    const key = match[1];
    // Convert index names to readable field names
    if (key.includes('username')) return 'Username';
    if (key.includes('email')) return 'Email';
    if (key.includes('invoice_number')) return 'Invoice number';
    return 'Field';
  }
  return 'Field';
};

/**
 * Handle JWT errors
 * @param {Error} error - JWT error
 * @returns {APIError} Formatted API error
 */
const handleJWTError = (error) => {
  console.error('JWT Error:', error);
  
  switch (error.name) {
    case 'TokenExpiredError':
      return new APIError('Token has expired', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_EXPIRED);
      
    case 'JsonWebTokenError':
      return new APIError('Invalid token', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID);
      
    case 'NotBeforeError':
      return new APIError('Token not active yet', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID);
      
    default:
      return new AuthenticationError('Token validation failed');
  }
};

/**
 * Handle validation errors from express-validator
 * @param {Array} errors - Validation errors
 * @returns {ValidationError} Formatted validation error
 */
const handleValidationErrors = (errors) => {
  const formattedErrors = errors.map(error => ({
    field: error.param || error.path,
    message: error.msg,
    value: error.value
  }));
  
  return new ValidationError('Validation failed', formattedErrors);
};

/**
 * Log error details
 * @param {Error} error - Error to log
 * @param {Object} req - Express request object
 */
const logError = (error, req = null) => {
  const timestamp = new Date().toISOString();
  const requestInfo = req ? {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    // body intentionally excluded to prevent logging sensitive data
  } : {};
  
  console.error('Error Log:', {
    timestamp,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      errorCode: error.errorCode
    },
    request: requestInfo
  });
};

/**
 * Format error response
 * @param {Error} error - Error object
 * @returns {Object} Formatted error response
 */
const formatErrorResponse = (error) => {
  const response = {
    status: API_RESPONSE.ERROR,
    message: error.message,
    code: error.errorCode || ERROR_CODES.INTERNAL_SERVER_ERROR,
    timestamp: new Date().toISOString()
  };
  
  // Add details for validation errors
  if (error.details) {
    response.details = error.details;
  }
  
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }
  
  return response;
};

/**
 * Global error handling middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const globalErrorHandler = (error, req, res, next) => {
  let apiError = error;
  
  // Convert known errors to APIError instances
  if (!(error instanceof APIError)) {
    if (error.code && typeof error.code === 'string' && error.code.startsWith('ER_')) {
      apiError = handleMySQLError(error);
    } else if (error.name && error.name.includes('JsonWebToken')) {
      apiError = handleJWTError(error);
    } else if (error.name === 'ValidationError' && error.errors) {
      apiError = handleValidationErrors(error.errors);
    } else {
      // Generic error - temporarily show actual error in production for debugging
      apiError = new APIError(
        error.message || 'Internal server error',
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        ERROR_CODES.INTERNAL_SERVER_ERROR
      );
    }
  }
  
  // Log the error
  logError(apiError, req);
  
  // Send error response
  const statusCode = apiError.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const errorResponse = formatErrorResponse(apiError);
  
  res.status(statusCode).json(errorResponse);
};

/**
 * Handle 404 errors
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
};

/**
 * Async error wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  handleMySQLError,
  handleJWTError,
  handleValidationErrors,
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
  logError,
  formatErrorResponse
};
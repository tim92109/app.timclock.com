/**
 * Authentication Middleware
 * JWT token validation and user authentication
 */

const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');
const { authConfig } = require('../config/auth');
const { 
  AuthenticationError, 
  AuthorizationError, 
  asyncHandler 
} = require('./errorHandler');
const { USER_ROLES } = require('../utils/constants');

// Token blacklist (in production, use Redis or database)
const tokenBlacklist = new Set();

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, authConfig.jwt.secret, {
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Extract token from request
 * @param {Object} req - Express request object
 * @returns {string|null} JWT token
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Also check for token in cookies (optional)
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  return null;
};

/**
 * Get user from database
 * @param {number} userId - User ID
 * @returns {Object|null} User object
 */
const getUserById = async (userId) => {
  const query = `
    SELECT id, username, email, first_name, last_name, role, 
           hourly_rate, is_active, last_login, created_at
    FROM users 
    WHERE id = ? AND is_active = 1
  `;
  
  const users = await executeQuery(query, [userId]);
  return users.length > 0 ? users[0] : null;
};

/**
 * Authentication middleware
 * Validates JWT token and attaches user to request
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  
  if (!token) {
    throw new AuthenticationError('Access token is required');
  }
  
  // Check if token is blacklisted
  if (tokenBlacklist.has(token)) {
    throw new AuthenticationError('Token has been revoked');
  }
  
  try {
    // Verify token
    const decoded = verifyToken(token);
    
    // Get user from database
    const user = await getUserById(decoded.userId);
    
    if (!user) {
      throw new AuthenticationError('User not found or inactive');
    }
    
    // Attach user and token to request
    req.user = user;
    req.token = token;
    req.tokenPayload = decoded;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid token');
    } else {
      throw error;
    }
  }
});

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't require it
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  
  if (token && !tokenBlacklist.has(token)) {
    try {
      const decoded = verifyToken(token);
      const user = await getUserById(decoded.userId);
      
      if (user) {
        req.user = user;
        req.token = token;
        req.tokenPayload = decoded;
      }
    } catch (error) {
      // Ignore errors for optional auth
      console.warn('Optional auth failed:', error.message);
    }
  }
  
  next();
});

/**
 * Role-based authorization middleware
 * @param {Array|string} allowedRoles - Allowed user roles
 * @returns {Function} Middleware function
 */
const authorize = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }
    
    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError(`Access denied. Required roles: ${roles.join(', ')}`);
    }
    
    next();
  });
};

/**
 * Resource ownership middleware
 * Checks if user owns the resource or has admin/manager role
 * @param {string} resourceUserField - Field name containing user ID
 * @returns {Function} Middleware function
 */
const authorizeResourceOwner = (resourceUserField = 'user_id') => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }
    
    // Admin and manager can access all resources
    if ([USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(req.user.role)) {
      return next();
    }
    
    // Get resource ID from params
    const resourceId = req.params.id;
    if (!resourceId) {
      throw new AuthorizationError('Resource ID required');
    }
    
    // This would need to be customized based on the resource type
    // For now, we'll check if the user ID matches
    const userId = req.params.userId || req.body[resourceUserField] || req.user.id;
    
    if (parseInt(userId) !== req.user.id) {
      throw new AuthorizationError('Access denied to this resource');
    }
    
    next();
  });
};

/**
 * Project access middleware
 * Checks if user has access to a specific project
 */
const authorizeProjectAccess = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new AuthenticationError('Authentication required');
  }
  
  // Admin can access all projects
  if (req.user.role === USER_ROLES.ADMIN) {
    return next();
  }
  
  const projectId = req.params.projectId || req.params.id || req.body.project_id;
  if (!projectId) {
    throw new AuthorizationError('Project ID required');
  }
  
  // Check if user has access to this project
  const query = `
    SELECT p.id, p.name, p.client_id, p.assigned_to, p.created_by
    FROM projects p
    WHERE p.id = ? AND p.is_active = 1
  `;
  
  const projects = await executeQuery(query, [projectId]);
  
  if (projects.length === 0) {
    throw new AuthorizationError('Project not found or access denied');
  }
  
  const project = projects[0];
  
  // Manager can access projects they created or are assigned to
  if (req.user.role === USER_ROLES.MANAGER) {
    if (project.created_by === req.user.id || project.assigned_to === req.user.id) {
      return next();
    }
  }
  
  // Employee can only access projects assigned to them
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    if (project.assigned_to === req.user.id) {
      return next();
    }
  }
  
  throw new AuthorizationError('Access denied to this project');
});

/**
 * Client access middleware
 * Checks if user has access to a specific client
 */
const authorizeClientAccess = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new AuthenticationError('Authentication required');
  }
  
  // Admin and manager can access all clients
  if ([USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(req.user.role)) {
    return next();
  }
  
  // Employees can only access clients through their assigned projects
  const clientId = req.params.clientId || req.params.id || req.body.client_id;
  if (!clientId) {
    throw new AuthorizationError('Client ID required');
  }
  
  const query = `
    SELECT DISTINCT c.id
    FROM clients c
    INNER JOIN projects p ON c.id = p.client_id
    WHERE c.id = ? AND p.assigned_to = ? AND c.is_active = 1
  `;
  
  const clients = await executeQuery(query, [clientId, req.user.id]);
  
  if (clients.length === 0) {
    throw new AuthorizationError('Access denied to this client');
  }
  
  next();
});

/**
 * Add token to blacklist
 * @param {string} token - Token to blacklist
 */
const blacklistToken = (token) => {
  tokenBlacklist.add(token);
  
  // Clean up old tokens periodically (in production, use Redis with TTL)
  if (tokenBlacklist.size > authConfig.tokenBlacklist.maxSize) {
    const tokensToRemove = Array.from(tokenBlacklist).slice(0, 100);
    tokensToRemove.forEach(t => tokenBlacklist.delete(t));
  }
};

/**
 * Logout middleware
 * Blacklists the current token
 */
const logout = asyncHandler(async (req, res, next) => {
  if (req.token) {
    blacklistToken(req.token);
  }
  next();
});

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @returns {Object} Token object with access and refresh tokens
 */
const generateTokens = (user) => {
  const payload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
  
  const accessToken = jwt.sign(payload, authConfig.jwt.secret, {
    expiresIn: authConfig.jwt.expiresIn,
    issuer: authConfig.jwt.issuer,
    audience: authConfig.jwt.audience
  });
  
  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    authConfig.jwt.secret,
    {
      expiresIn: authConfig.jwt.refreshExpiresIn,
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience
    }
  );
  
  return {
    accessToken,
    refreshToken,
    expiresIn: authConfig.jwt.expiresIn
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  authorizeResourceOwner,
  authorizeProjectAccess,
  authorizeClientAccess,
  logout,
  generateTokens,
  blacklistToken,
  verifyToken,
  extractToken
};
/**
 * Authentication Controller
 * Handles user authentication, registration, and session management
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { executeQuery, executeTransaction } = require('../config/database');
const { authConfig } = require('../config/auth');
const { generateTokens } = require('../middleware/auth');
const { 
  AuthenticationError, 
  ConflictError, 
  NotFoundError,
  ValidationError,
  asyncHandler 
} = require('../middleware/errorHandler');
const { 
  HTTP_STATUS, 
  SUCCESS_MESSAGES, 
  USER_ROLES,
  API_RESPONSE 
} = require('../utils/constants');
const { formatDate } = require('../utils/helpers');

/**
 * Register new user
 * POST /api/auth/register
 */
const register = asyncHandler(async (req, res) => {
  const {
    username,
    email,
    password,
    first_name,
    last_name,
    role = USER_ROLES.EMPLOYEE,
    hourly_rate,
    phone
  } = req.body;

  // SECURITY: Prevent self-registration as admin/manager
  const assignedRole = USER_ROLES.EMPLOYEE;

  // Check if user already exists
  const existingUserQuery = `
    SELECT id FROM users 
    WHERE username = ? OR email = ?
  `;
  const existingUsers = await executeQuery(existingUserQuery, [username, email]);
  
  if (existingUsers.length > 0) {
    throw new ConflictError('Username or email already exists');
  }

  // Hash password
  const saltRounds = authConfig.password.bcryptRounds;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // Insert new user
  const insertQuery = `
    INSERT INTO users (
      username, email, password_hash, first_name, last_name, 
      role, hourly_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;
  
  const result = await executeQuery(insertQuery, [
    username,
    email,
    password_hash,
    first_name,
    last_name,
    assignedRole,
    hourly_rate || null
  ]);

  // Get the created user
  const userQuery = `
    SELECT id, username, email, first_name, last_name, role, 
           hourly_rate, is_active, created_at
    FROM users 
    WHERE id = ?
  `;
  const users = await executeQuery(userQuery, [result.insertId]);
  const user = users[0];

  // Generate tokens
  const tokens = generateTokens(user);

  // Update last login
  await executeQuery(
    'UPDATE users SET last_login = NOW() WHERE id = ?',
    [user.id]
  );

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.USER_CREATED,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        hourly_rate: user.hourly_rate,
        is_active: user.is_active,
        created_at: user.created_at
      },
      tokens
    }
  });
});


/**
 * Login user
 * POST /api/auth/login
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  // Find user by username or email
  const userQuery = `
    SELECT id, username, email, password_hash, first_name, last_name, 
           role, hourly_rate, is_active, last_login
    FROM users 
    WHERE (username = ? OR email = ?) AND is_active = 1
  `;
  
  const users = await executeQuery(userQuery, [username, username]);
  
  if (users.length === 0) {
    throw new AuthenticationError('Invalid credentials');
  }

  const user = users[0];

  // Check if hash is MD5 (32 chars, hex) or bcrypt (starts with $2, ~60 chars)
  const isMD5Hash = user.password_hash && user.password_hash.length === 32 && /^[a-f0-9]+$/i.test(user.password_hash);
  
  let isValidPassword = false;
  let shouldUpdatePassword = false;

  if (isMD5Hash) {
    // Legacy MD5 verification
    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
    isValidPassword = md5Hash === user.password_hash.toLowerCase();
    shouldUpdatePassword = isValidPassword; // Migrate to bcrypt if valid
    console.log('🔄 Legacy MD5 authentication for user:', user.username);
  } else {
    // Modern bcrypt verification
    isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log('🔐 bcrypt authentication for user:', user.username);
  }
  
  if (!isValidPassword) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Migrate MD5 password to bcrypt if needed
  if (shouldUpdatePassword) {
    try {
      const saltRounds = authConfig.password.bcryptRounds;
      const newPasswordHash = await bcrypt.hash(password, saltRounds);
      
      await executeQuery(
        'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
        [newPasswordHash, user.id]
      );
      
      console.log('✅ Password migrated to bcrypt for user:', user.username);
    } catch (migrateError) {
      console.error('⚠️ Failed to migrate password for user:', user.username, migrateError);
      // Continue with login even if migration fails
    }
  }

  // Generate tokens
  const tokens = generateTokens(user);

  // Update last login
  await executeQuery(
    'UPDATE users SET last_login = NOW() WHERE id = ?',
    [user.id]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        hourly_rate: user.hourly_rate,
        last_login: formatDate(user.last_login)
      },
      tokens
    }
  });
});

/**
 * Logout user
 * POST /api/auth/logout
 */
const logout = asyncHandler(async (req, res) => {
  // Token is blacklisted in the logout middleware
  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.LOGOUT_SUCCESS
  });
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AuthenticationError('Refresh token is required');
  }

  try {
    const decoded = jwt.verify(refreshToken, authConfig.jwt.secret);
    
    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid refresh token');
    }

    // Get user
    const userQuery = `
      SELECT id, username, email, first_name, last_name, role, 
             hourly_rate, is_active
      FROM users 
      WHERE id = ? AND is_active = 1
    `;
    
    const users = await executeQuery(userQuery, [decoded.userId]);
    
    if (users.length === 0) {
      throw new AuthenticationError('User not found');
    }

    const user = users[0];
    const tokens = generateTokens(user);

    res.json({
      status: API_RESPONSE.SUCCESS,
      message: 'Token refreshed successfully',
      data: { tokens }
    });

  } catch (error) {
    throw new AuthenticationError('Invalid refresh token');
  }
});

/**
 * Get current user profile
 * GET /api/auth/profile
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = req.user;

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        hourly_rate: user.hourly_rate,
        is_active: user.is_active,
        last_login: formatDate(user.last_login),
        created_at: formatDate(user.created_at)
      }
    }
  });
});

/**
 * Update user profile
 * PUT /api/auth/profile
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    first_name,
    last_name,
    email,
    phone,
    hourly_rate
  } = req.body;

  // Check if email is already taken by another user
  if (email) {
    const existingUserQuery = `
      SELECT id FROM users 
      WHERE email = ? AND id != ?
    `;
    const existingUsers = await executeQuery(existingUserQuery, [email, userId]);
    
    if (existingUsers.length > 0) {
      throw new ConflictError('Email already exists');
    }
  }

  // Build update query dynamically
  const updateFields = [];
  const updateValues = [];

  if (first_name !== undefined) {
    updateFields.push('first_name = ?');
    updateValues.push(first_name);
  }
  if (last_name !== undefined) {
    updateFields.push('last_name = ?');
    updateValues.push(last_name);
  }
  if (email !== undefined) {
    updateFields.push('email = ?');
    updateValues.push(email);
  }
  if (hourly_rate !== undefined) {
    updateFields.push('hourly_rate = ?');
    updateValues.push(hourly_rate);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateFields.push('updated_at = NOW()');
  updateValues.push(userId);

  const updateQuery = `
    UPDATE users 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `;

  await executeQuery(updateQuery, updateValues);

  // Get updated user
  const userQuery = `
    SELECT id, username, email, first_name, last_name, role, 
           hourly_rate, is_active, last_login, created_at, updated_at
    FROM users 
    WHERE id = ?
  `;
  
  const users = await executeQuery(userQuery, [userId]);
  const user = users[0];

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.USER_UPDATED,
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        hourly_rate: user.hourly_rate,
        is_active: user.is_active,
        last_login: formatDate(user.last_login),
        created_at: formatDate(user.created_at),
        updated_at: formatDate(user.updated_at)
      }
    }
  });
});

/**
 * Change password
 * PUT /api/auth/change-password
 */
const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new ValidationError('Current password and new password are required');
  }

  // Get current password hash
  const userQuery = `
    SELECT password_hash FROM users WHERE id = ?
  `;
  const users = await executeQuery(userQuery, [userId]);
  
  if (users.length === 0) {
    throw new NotFoundError('User not found');
  }

  const user = users[0];

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
  
  if (!isValidPassword) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Hash new password
  const saltRounds = authConfig.password.bcryptRounds;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await executeQuery(
    'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
    [newPasswordHash, userId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Password changed successfully'
  });
});

/**
 * Verify token (for frontend validation)
 * GET /api/auth/verify
 */
const verifyToken = asyncHandler(async (req, res) => {
  // If we reach here, the token is valid (checked by auth middleware)
  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Token is valid',
    data: {
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role
      }
    }
  });
});

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  verifyToken
};
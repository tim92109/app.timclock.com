/**
 * Authentication Routes
 * Handles user authentication endpoints
 */

const express = require('express');
const router = express.Router();

const {
  register,
  login,
  logout,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword,
  verifyToken
} = require('../controllers/authController');

const { authenticate, logout: logoutMiddleware } = require('../middleware/auth');
const { userValidations, handleValidationErrors } = require('../middleware/validation');

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post('/register', 
  userValidations.register,
  handleValidationErrors,
  register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login',
  userValidations.login,
  handleValidationErrors,
  login
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout',
  authenticate,
  logoutMiddleware,
  logout
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', refreshToken);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile',
  authenticate,
  getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile',
  authenticate,
  userValidations.update,
  handleValidationErrors,
  updateProfile
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password',
  authenticate,
  changePassword
);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify token validity
 * @access  Private
 */
router.get('/verify',
  authenticate,
  verifyToken
);

module.exports = router;
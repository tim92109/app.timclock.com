/**
 * User Routes
 * Handles all user-related API endpoints
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/users
 * @desc    Get active users (used to populate project-assignee picker)
 * @access  Private (Admin, Manager only)
 */
router.get('/', 
  authorize(['admin', 'manager']), 
  userController.getUsers
);

/**
 * @route   GET /api/users/team
 * @desc    Get the users who report to the current manager
 * @access  Private (Admin, Manager only)
 */
router.get('/team',
  authorize(['admin', 'manager']),
  userController.getTeam
);

/**
 * @route   GET /api/users/available
 * @desc    Get users not yet assigned to a manager
 * @access  Private (Admin, Manager only)
 */
router.get('/available',
  authorize(['admin', 'manager']),
  userController.getAvailableEmployees
);

/**
 * @route   PUT /api/users/:id/manager
 * @desc    Assign (or clear) a user's manager
 * @access  Private (Admin, Manager only)
 */
router.put('/:id/manager',
  authorize(['admin', 'manager']),
  userController.assignManager
);

module.exports = router;

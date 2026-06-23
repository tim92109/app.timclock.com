/**
 * Time Entry Routes
 * Handles all time tracking related API endpoints
 */

const express = require('express');
const router = express.Router();
const timeController = require('../controllers/timeController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateTimeEntry, validateTimeEntryUpdate, validateClockAction } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/time-entries
 * @desc    Get all time entries (with role-based filtering)
 * @access  Private (Admin, Manager, Employee)
 */
router.get('/', timeController.getTimeEntries);

/**
 * @route   GET /api/time-entries/active
 * @desc    Get current active time entry for user
 * @access  Private (Admin, Manager, Employee)
 */
router.get('/active', timeController.getActiveTimeEntry);

/**
 * @route   GET /api/time-entries/date-range
 * @desc    Get time entries within date range
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/date-range', timeController.getTimeEntriesByDateRange);

/**
 * @route   GET /api/time-entries/user/:userId
 * @desc    Get time entries for specific user
 * @access  Private (Admin, Manager only, or own entries)
 */
router.get('/user/:userId', timeController.getUserTimeEntries);

/**
 * @route   GET /api/time-entries/project/:projectId
 * @desc    Get time entries for specific project
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/project/:projectId', timeController.getProjectTimeEntries);

/**
 * @route   POST /api/time-entries/bulk
 * @desc    Create multiple time entries
 * @access  Private (Admin, Manager only)
 */
router.post('/bulk', 
  authorize(['admin', 'manager']), 
  timeController.createBulkTimeEntries
);

/**
 * @route   PUT /api/time-entries/bulk
 * @desc    Update multiple time entries
 * @access  Private (Admin, Manager only)
 */
router.put('/bulk', 
  authorize(['admin', 'manager']), 
  timeController.updateBulkTimeEntries
);

/**
 * @route   DELETE /api/time-entries/bulk
 * @desc    Delete multiple time entries
 * @access  Private (Admin, Manager only)
 */
router.delete('/bulk', 
  authorize(['admin', 'manager']), 
  timeController.deleteBulkTimeEntries
);

/**
 * @route   GET /api/time-entries/export
 * @desc    Export time entries to CSV
 * @access  Private (Admin, Manager only)
 */
router.get('/export', 
  authorize(['admin', 'manager']), 
  timeController.exportTimeEntries
);

/**
 * @route   GET /api/time-entries/summary
 * @desc    Get time entries summary/statistics
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/summary', timeController.getTimeEntriesSummary);

/**
 * @route   POST /api/time-entries
 * @desc    Create new time entry (manual entry)
 * @access  Private (Admin, Manager, Employee)
 */
router.post('/', 
  validateTimeEntry, 
  timeController.createTimeEntry
);

/**
 * @route   POST /api/time-entries/clock-in
 * @desc    Clock in (start time tracking)
 * @access  Private (Admin, Manager, Employee)
 */
router.post('/clock-in', 
  validateClockAction, 
  timeController.clockIn
);

/**
 * @route   POST /api/time-entries/clock-out
 * @desc    Clock out (end time tracking)
 * @access  Private (Admin, Manager, Employee)
 */
router.post('/clock-out',
  timeController.clockOut
);

/**
 * @route   GET /api/time-entries/:id
 * @desc    Get time entry by ID
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id', timeController.getTimeEntryById);

/**
 * @route   PUT /api/time-entries/:id
 * @desc    Update time entry
 * @access  Private (Admin, Manager, Employee - own entries only unless admin/manager)
 */
router.put('/:id', 
  validateTimeEntryUpdate, 
  timeController.updateTimeEntry
);

/**
 * @route   DELETE /api/time-entries/:id
 * @desc    Delete time entry
 * @access  Private (Admin, Manager, Employee - own entries only unless admin/manager)
 */
router.delete('/:id', timeController.deleteTimeEntry);

module.exports = router;

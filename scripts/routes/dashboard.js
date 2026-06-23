/**
 * Dashboard Routes
 * Handles all dashboard and analytics related API endpoints
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, authorize } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/dashboard
 * @desc    Get dashboard overview (role-based data) - Root endpoint
 * @access  Private (Admin, Manager, Employee)
 */
router.get('/', dashboardController.getDashboardOverview);

/**
 * @route   GET /api/dashboard/overview
 * @desc    Get dashboard overview (role-based data)
 * @access  Private (Admin, Manager, Employee)
 */
router.get('/overview', dashboardController.getDashboardOverview);

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get dashboard statistics
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/stats', dashboardController.getDashboardStats);

/**
 * @route   GET /api/dashboard/time-tracking
 * @desc    Get time tracking dashboard data
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/time-tracking', dashboardController.getTimeTrackingDashboard);

/**
 * @route   GET /api/dashboard/projects
 * @desc    Get projects dashboard data
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/projects', dashboardController.getProjectsDashboard);

/**
 * @route   GET /api/dashboard/clients
 * @desc    Get clients dashboard data
 * @access  Private (Admin, Manager only)
 */
router.get('/clients', 
  authorize(['admin', 'manager']), 
  dashboardController.getClientsDashboard
);

/**
 * @route   GET /api/dashboard/billing
 * @desc    Get billing dashboard data
 * @access  Private (Admin, Manager only)
 */
router.get('/billing', 
  authorize(['admin', 'manager']), 
  dashboardController.getBillingDashboard
);

/**
 * @route   GET /api/dashboard/team
 * @desc    Get team dashboard data
 * @access  Private (Admin, Manager only)
 */
router.get('/team', 
  authorize(['admin', 'manager']), 
  dashboardController.getTeamDashboard
);

/**
 * @route   GET /api/dashboard/reports/productivity
 * @desc    Get productivity report
 * @access  Private (Admin, Manager only)
 */
router.get('/reports/productivity', 
  authorize(['admin', 'manager']), 
  dashboardController.getProductivityReport
);

/**
 * @route   GET /api/dashboard/reports/time-summary
 * @desc    Get time summary report
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/reports/time-summary', dashboardController.getTimeSummaryReport);

/**
 * @route   GET /api/dashboard/reports/project-progress
 * @desc    Get project progress report
 * @access  Private (Admin, Manager only)
 */
router.get('/reports/project-progress', 
  authorize(['admin', 'manager']), 
  dashboardController.getProjectProgressReport
);

/**
 * @route   GET /api/dashboard/charts/time-distribution
 * @desc    Get time distribution chart data
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/charts/time-distribution', dashboardController.getTimeDistributionChart);

/**
 * @route   GET /api/dashboard/charts/project-hours
 * @desc    Get project hours chart data
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/charts/project-hours', dashboardController.getProjectHoursChart);

/**
 * @route   GET /api/dashboard/charts/revenue-trend
 * @desc    Get revenue trend chart data
 * @access  Private (Admin, Manager only)
 */
router.get('/charts/revenue-trend', 
  authorize(['admin', 'manager']), 
  dashboardController.getRevenueTrendChart
);

/**
 * @route   GET /api/dashboard/charts/team-performance
 * @desc    Get team performance chart data
 * @access  Private (Admin, Manager only)
 */
router.get('/charts/team-performance', 
  authorize(['admin', 'manager']), 
  dashboardController.getTeamPerformanceChart
);

/**
 * @route   GET /api/dashboard/recent-activity
 * @desc    Get recent activity feed
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/recent-activity', dashboardController.getRecentActivity);

/**
 * @route   GET /api/dashboard/notifications
 * @desc    Get dashboard notifications
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/notifications', dashboardController.getDashboardNotifications);

/**
 * @route   GET /api/dashboard/quick-actions
 * @desc    Get available quick actions for user
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/quick-actions', dashboardController.getQuickActions);

/**
 * @route   GET /api/dashboard/widgets
 * @desc    Get dashboard widgets configuration
 * @access  Private (Admin, Manager, Employee - filtered by role)
 */
router.get('/widgets', dashboardController.getDashboardWidgets);

/**
 * @route   POST /api/dashboard/widgets
 * @desc    Update dashboard widgets configuration
 * @access  Private (Admin, Manager, Employee)
 */
router.post('/widgets', dashboardController.updateDashboardWidgets);

module.exports = router;
/**
 * Project Routes
 * Handles all project-related API endpoints
 */

const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateProject, validateProjectUpdate, validateProjectAssignment } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/projects
 * @desc    Get all projects (with role-based filtering)
 * @access  Private (Admin, Manager, Employee)
 */
router.get('/', projectController.getProjects);

/**
 * @route   GET /api/projects/templates
 * @desc    Get project templates
 * @access  Private (Admin, Manager only)
 */
router.get('/templates', 
  authorize(['admin', 'manager']), 
  projectController.getProjectTemplates
);

/**
 * @route   POST /api/projects/from-template
 * @desc    Create project from template
 * @access  Private (Admin, Manager only)
 */
router.post('/from-template', 
  authorize(['admin', 'manager']), 
  projectController.createProjectFromTemplate
);

/**
 * @route   POST /api/projects
 * @desc    Create new project
 * @access  Private (Admin, Manager only)
 */
router.post('/', 
  authorize(['admin', 'manager']), 
  validateProject, 
  projectController.createProject
);

/**
 * @route   GET /api/projects/:id
 * @desc    Get project by ID
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id', projectController.getProjectById);

/**
 * @route   PUT /api/projects/:id
 * @desc    Update project
 * @access  Private (Admin, Manager only)
 */
router.put('/:id', 
  authorize(['admin', 'manager']), 
  validateProjectUpdate, 
  projectController.updateProject
);

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete project
 * @access  Private (Admin only)
 */
router.delete('/:id', 
  authorize(['admin']), 
  projectController.deleteProject
);

/**
 * @route   POST /api/projects/:id/assign
 * @desc    Assign user to project
 * @access  Private (Admin, Manager only)
 */
router.post('/:id/assign', 
  authorize(['admin', 'manager']), 
  validateProjectAssignment, 
  projectController.assignUserToProject
);

/**
 * @route   DELETE /api/projects/:id/assign/:userId
 * @desc    Remove user from project
 * @access  Private (Admin, Manager only)
 */
router.delete('/:id/assign/:userId', 
  authorize(['admin', 'manager']), 
  projectController.removeUserFromProject
);

/**
 * @route   GET /api/projects/:id/users
 * @desc    Get all users assigned to project
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/users', projectController.getProjectUsers);

/**
 * @route   GET /api/projects/:id/tasks
 * @desc    Get all tasks for project
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/tasks', projectController.getProjectTasks);

/**
 * @route   GET /api/projects/:id/time
 * @desc    Get all time entries for project (alias for time-entries)
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/time', projectController.getProjectTimeEntries);

/**
 * @route   GET /api/projects/:id/time-entries
 * @desc    Get all time entries for project
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/time-entries', projectController.getProjectTimeEntries);

/**
 * @route   GET /api/projects/:id/stats
 * @desc    Get project statistics
 * @access  Private (Admin, Manager only)
 */
router.get('/:id/stats', 
  authorize(['admin', 'manager']), 
  projectController.getProjectStats
);

/**
 * @route   POST /api/projects/:id/status
 * @desc    Update project status
 * @access  Private (Admin, Manager only)
 */
router.post('/:id/status', 
  authorize(['admin', 'manager']), 
  projectController.updateProjectStatus
);

module.exports = router;

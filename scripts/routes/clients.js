/**
 * Client Routes
 * Handles all client-related API endpoints
 */

const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateClient, validateClientUpdate } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/clients
 * @desc    Get all clients (with role-based filtering)
 * @access  Private (Admin, Manager, Employee)
 */
router.get('/', clientController.getClients);

/**
 * @route   GET /api/clients/:id
 * @desc    Get client by ID
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id', clientController.getClientById);

/**
 * @route   POST /api/clients
 * @desc    Create new client
 * @access  Private (Admin, Manager only)
 */
router.post('/', 
  authorize(['admin', 'manager']), 
  validateClient, 
  clientController.createClient
);

/**
 * @route   PUT /api/clients/:id
 * @desc    Update client
 * @access  Private (Admin, Manager only)
 */
router.put('/:id', 
  authorize(['admin', 'manager']), 
  validateClientUpdate, 
  clientController.updateClient
);

/**
 * @route   DELETE /api/clients/:id
 * @desc    Delete client
 * @access  Private (Admin only)
 */
router.delete('/:id', 
  authorize(['admin']), 
  clientController.deleteClient
);

/**
 * @route   GET /api/clients/:id/projects
 * @desc    Get all projects for a client
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/projects', clientController.getClientProjects);

/**
 * @route   GET /api/clients/:id/stats
 * @desc    Get client statistics
 * @access  Private (Admin, Manager only)
 */
router.get('/:id/stats', 
  authorize(['admin', 'manager']), 
  clientController.getClientStats
);

/**
 * @route   GET /api/clients/:id/time
 * @desc    Get all time entries for a client
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/time', clientController.getClientTime);

/**
 * @route   GET /api/clients/:id/invoices
 * @desc    Get all invoices for a client
 * @access  Private (Admin, Manager, Employee - filtered by access)
 */
router.get('/:id/invoices', clientController.getClientInvoices);

module.exports = router;
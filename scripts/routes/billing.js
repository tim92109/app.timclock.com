/**
 * Billing Routes
 * Handles all billing and invoice related API endpoints
 */

const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateInvoice, validateInvoiceUpdate, validatePayment } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   GET /api/billing/invoices
 * @desc    Get all invoices (with role-based filtering)
 * @access  Private (Admin, Manager only)
 */
router.get('/invoices', 
  authorize(['admin', 'manager']), 
  billingController.getInvoices
);

/**
 * @route   GET /api/billing/invoices/:id
 * @desc    Get invoice by ID
 * @access  Private (Admin, Manager only)
 */
router.get('/invoices/:id', 
  authorize(['admin', 'manager']), 
  billingController.getInvoiceById
);

/**
 * @route   POST /api/billing/invoices
 * @desc    Create new invoice
 * @access  Private (Admin, Manager only)
 */
router.post('/invoices', 
  authorize(['admin', 'manager']), 
  validateInvoice, 
  billingController.createInvoice
);

/**
 * @route   PUT /api/billing/invoices/:id
 * @desc    Update invoice
 * @access  Private (Admin, Manager only)
 */
router.put('/invoices/:id', 
  authorize(['admin', 'manager']), 
  validateInvoiceUpdate, 
  billingController.updateInvoice
);

/**
 * @route   DELETE /api/billing/invoices/:id
 * @desc    Delete invoice
 * @access  Private (Admin only)
 */
router.delete('/invoices/:id', 
  authorize(['admin']), 
  billingController.deleteInvoice
);

/**
 * @route   POST /api/billing/invoices/generate
 * @desc    Generate invoice from time entries
 * @access  Private (Admin, Manager only)
 */
router.post('/invoices/generate', 
  authorize(['admin', 'manager']), 
  billingController.generateInvoice
);

/**
 * @route   GET /api/billing/invoices/:id/pdf
 * @desc    Generate and download invoice PDF
 * @access  Private (Admin, Manager only)
 */
router.get('/invoices/:id/pdf', 
  authorize(['admin', 'manager']), 
  billingController.generateInvoicePDF
);

/**
 * @route   POST /api/billing/invoices/:id/send
 * @desc    Send invoice via email
 * @access  Private (Admin, Manager only)
 */
router.post('/invoices/:id/send', 
  authorize(['admin', 'manager']), 
  billingController.sendInvoice
);

/**
 * @route   POST /api/billing/invoices/:id/payment
 * @desc    Record payment for invoice
 * @access  Private (Admin, Manager only)
 */
router.post('/invoices/:id/payment', 
  authorize(['admin', 'manager']), 
  validatePayment, 
  billingController.recordPayment
);

/**
 * @route   GET /api/billing/invoices/:id/payments
 * @desc    Get all payments for invoice
 * @access  Private (Admin, Manager only)
 */
router.get('/invoices/:id/payments', 
  authorize(['admin', 'manager']), 
  billingController.getInvoicePayments
);

/**
 * @route   GET /api/billing/rates
 * @desc    Get billing rates
 * @access  Private (Admin, Manager only)
 */
router.get('/rates', 
  authorize(['admin', 'manager']), 
  billingController.getBillingRates
);

/**
 * @route   POST /api/billing/rates
 * @desc    Create billing rate
 * @access  Private (Admin only)
 */
router.post('/rates', 
  authorize(['admin']), 
  billingController.createBillingRate
);

/**
 * @route   PUT /api/billing/rates/:id
 * @desc    Update billing rate
 * @access  Private (Admin only)
 */
router.put('/rates/:id', 
  authorize(['admin']), 
  billingController.updateBillingRate
);

/**
 * @route   DELETE /api/billing/rates/:id
 * @desc    Delete billing rate
 * @access  Private (Admin only)
 */
router.delete('/rates/:id', 
  authorize(['admin']), 
  billingController.deleteBillingRate
);

/**
 * @route   GET /api/billing/reports/revenue
 * @desc    Get revenue report
 * @access  Private (Admin, Manager only)
 */
router.get('/reports/revenue', 
  authorize(['admin', 'manager']), 
  billingController.getRevenueReport
);

/**
 * @route   GET /api/billing/reports/outstanding
 * @desc    Get outstanding invoices report
 * @access  Private (Admin, Manager only)
 */
router.get('/reports/outstanding', 
  authorize(['admin', 'manager']), 
  billingController.getOutstandingInvoicesReport
);

/**
 * @route   GET /api/billing/reports/client-billing
 * @desc    Get client billing summary
 * @access  Private (Admin, Manager only)
 */
router.get('/reports/client-billing', 
  authorize(['admin', 'manager']), 
  billingController.getClientBillingReport
);

/**
 * @route   GET /api/billing/export
 * @desc    Export billing data to CSV
 * @access  Private (Admin, Manager only)
 */
router.get('/export', 
  authorize(['admin', 'manager']), 
  billingController.exportBillingData
);

/**
 * @route   GET /api/billing/summary
 * @desc    Get billing summary
 * @access  Private (Admin, Manager only)
 */
router.get('/summary',
  authorize(['admin', 'manager']),
  billingController.getBillingSummary
);

/**
 * @route   POST /api/billing/invoices/:id/mark-paid
 * @desc    Mark invoice as paid
 * @access  Private (Admin, Manager only)
 */
router.post('/invoices/:id/mark-paid',
  authorize(['admin', 'manager']),
  billingController.recordPayment
);

/**
 * @route   GET /api/billing/summary
 * @desc    Get billing summary
 * @access  Private (Admin, Manager only)
 */
router.get('/summary',
  authorize(['admin', 'manager']),
  billingController.getBillingSummary
);

/**
 * @route   POST /api/billing/invoices/:id/mark-paid
 * @desc    Mark invoice as paid
 * @access  Private (Admin, Manager only)
 */
router.post('/invoices/:id/mark-paid',
  authorize(['admin', 'manager']),
  billingController.recordPayment
);

module.exports = router;
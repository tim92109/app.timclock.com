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
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/invoices', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.getInvoices
);

/**
 * @route   GET /api/billing/invoices/:id
 * @desc    Get invoice by ID
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/invoices/:id', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.getInvoiceById
);

/**
 * @route   POST /api/billing/invoices
 * @desc    Create new invoice
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/invoices', 
  authorize(['admin', 'manager', 'contractor']), 
  validateInvoice, 
  billingController.createInvoice
);

/**
 * @route   PUT /api/billing/invoices/:id
 * @desc    Update invoice
 * @access  Private (Admin, Manager, Contractor)
 */
router.put('/invoices/:id', 
  authorize(['admin', 'manager', 'contractor']), 
  validateInvoiceUpdate, 
  billingController.updateInvoice
);

/**
 * @route   DELETE /api/billing/invoices/:id
 * @desc    Delete invoice (non-admins may delete only their own invoices)
 * @access  Private (Admin, Manager, Contractor)
 */
router.delete('/invoices/:id', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.deleteInvoice
);

/**
 * @route   POST /api/billing/invoices/generate
 * @desc    Generate invoice from time entries
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/invoices/generate', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.generateInvoice
);

/**
 * @route   GET /api/billing/invoices/:id/pdf
 * @desc    Generate and download invoice PDF
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/invoices/:id/pdf', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.generateInvoicePDF
);

/**
 * @route   POST /api/billing/invoices/:id/send
 * @desc    Send invoice via email
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/invoices/:id/send', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.sendInvoice
);

/**
 * @route   POST /api/billing/invoices/:id/payment
 * @desc    Record payment for invoice
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/invoices/:id/payment', 
  authorize(['admin', 'manager', 'contractor']), 
  validatePayment, 
  billingController.recordPayment
);

/**
 * @route   GET /api/billing/invoices/:id/payments
 * @desc    Get all payments for invoice
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/invoices/:id/payments', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.getInvoicePayments
);

/**
 * @route   GET /api/billing/rates
 * @desc    Get billing rates
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/rates', 
  authorize(['admin', 'manager', 'contractor']), 
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
 * @access  Private (Admin, Manager)
 */
router.get('/reports/revenue', 
  authorize(['admin', 'manager']), 
  billingController.getRevenueReport
);

/**
 * @route   GET /api/billing/reports/outstanding
 * @desc    Get outstanding invoices report
 * @access  Private (Admin, Manager)
 */
router.get('/reports/outstanding', 
  authorize(['admin', 'manager']), 
  billingController.getOutstandingInvoicesReport
);

/**
 * @route   GET /api/billing/reports/client-billing
 * @desc    Get client billing summary
 * @access  Private (Admin, Manager)
 */
router.get('/reports/client-billing', 
  authorize(['admin', 'manager']), 
  billingController.getClientBillingReport
);

/**
 * @route   GET /api/billing/export
 * @desc    Export billing data to CSV
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/export', 
  authorize(['admin', 'manager', 'contractor']), 
  billingController.exportBillingData
);

/**
 * @route   GET /api/billing/invoices/:id/download
 * @desc    Download invoice PDF (alias of /pdf used by the UI)
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/invoices/:id/download',
  authorize(['admin', 'manager', 'contractor']),
  billingController.generateInvoicePDF
);

/**
 * @route   GET /api/billing/billable-projects
 * @desc    List projects with unbilled time entries
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/billable-projects',
  authorize(['admin', 'manager', 'contractor']),
  billingController.getBillableProjects
);

/**
 * @route   POST /api/billing/generate-invoice/:projectId
 * @desc    Generate an invoice for a project's unbilled time entries
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/generate-invoice/:projectId',
  authorize(['admin', 'manager', 'contractor']),
  billingController.generateInvoiceFromProject
);

/**
 * @route   GET /api/billing/summary
 * @desc    Get billing summary
 * @access  Private (Admin, Manager, Contractor)
 */
router.get('/summary',
  authorize(['admin', 'manager', 'contractor']),
  billingController.getBillingSummary
);

/**
 * @route   POST /api/billing/invoices/:id/mark-paid
 * @desc    Mark invoice as paid (settles the full outstanding amount)
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/invoices/:id/mark-paid',
  authorize(['admin', 'manager', 'contractor']),
  billingController.markInvoicePaid
);

/**
 * @route   POST /api/billing/invoices/:id/mark-sent
 * @desc    Mark invoice as sent without emailing it
 * @access  Private (Admin, Manager, Contractor)
 */
router.post('/invoices/:id/mark-sent',
  authorize(['admin', 'manager', 'contractor']),
  billingController.markInvoiceSent
);

module.exports = router;
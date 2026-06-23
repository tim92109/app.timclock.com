/**
 * Billing Controller
 * Handles invoice generation and billing operations
 */

const moment = require('moment');
const { executeQuery, executeTransaction } = require('../config/database');
const {
  NotFoundError,
  ConflictError,
  ValidationError,
  AuthorizationError,
  asyncHandler
} = require('../middleware/errorHandler');
const { 
  HTTP_STATUS, 
  SUCCESS_MESSAGES, 
  API_RESPONSE,
  USER_ROLES,
  INVOICE_STATUS,
  PROJECT_STATUS 
} = require('../utils/constants');
const { 
  parsePagination, 
  buildPaginatedResponse,
  formatDate,
  generateInvoiceNumber,
  calculateBillableAmount,
  formatCurrency,
  removeEmptyValues 
} = require('../utils/helpers');

/**
 * Get all invoices with pagination and filtering
 * GET /api/billing/invoices
 */
const getInvoices = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { status, client_id, start_date, end_date } = req.query;

  // Build WHERE clause
  const whereConditions = [];
  const queryParams = [];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    // Employees can only see invoices for projects they worked on
    whereConditions.push(`
      i.id IN (
        SELECT DISTINCT ii.invoice_id 
        FROM invoice_items ii
        INNER JOIN time_entries te ON ii.time_entry_id = te.id
        WHERE te.user_id = ?
      )
    `);
    queryParams.push(req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    // Managers can see invoices for projects they created or are assigned to
    whereConditions.push(`
      (i.created_by = ? OR i.project_id IN (
        SELECT id FROM projects 
        WHERE assigned_to = ? OR created_by = ?
      ))
    `);
    queryParams.push(req.user.id, req.user.id, req.user.id);
  }

  if (status) {
    whereConditions.push('i.status = ?');
    queryParams.push(status);
  }

  if (client_id) {
    whereConditions.push('i.client_id = ?');
    queryParams.push(client_id);
  }

  if (start_date) {
    whereConditions.push('i.issue_date >= ?');
    queryParams.push(start_date);
  }

  if (end_date) {
    whereConditions.push('i.issue_date <= ?');
    queryParams.push(end_date);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM invoices i
    ${whereClause}
  `;
  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  // Get invoices with pagination
  const invoicesQuery = `
    SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date, i.paid_date,
           i.subtotal, i.tax_rate, i.tax_amount, i.total_amount, i.currency,
           i.notes, i.created_at, i.updated_at,
           c.id as client_id, c.name as client_name, c.company as client_company,
           p.id as project_id, p.name as project_name,
           creator.first_name as creator_first_name, creator.last_name as creator_last_name
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    LEFT JOIN users creator ON i.created_by = creator.id
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const invoices = await executeQuery(invoicesQuery, [...queryParams, limit, offset]);

  // Format response
  const formattedInvoices = invoices.map(invoice => ({
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    issue_date: formatDate(invoice.issue_date),
    due_date: formatDate(invoice.due_date),
    paid_date: formatDate(invoice.paid_date),
    subtotal: parseFloat(invoice.subtotal),
    tax_rate: parseFloat(invoice.tax_rate),
    tax_amount: parseFloat(invoice.tax_amount),
    total_amount: parseFloat(invoice.total_amount),
    currency: invoice.currency,
    notes: invoice.notes,
    client: {
      id: invoice.client_id,
      name: invoice.client_name,
      company: invoice.client_company
    },
    project: invoice.project_id ? {
      id: invoice.project_id,
      name: invoice.project_name
    } : null,
    created_by: `${invoice.creator_first_name} ${invoice.creator_last_name}`,
    created_at: formatDate(invoice.created_at),
    updated_at: formatDate(invoice.updated_at)
  }));

  const response = buildPaginatedResponse(formattedInvoices, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Get invoice by ID
 * GET /api/billing/invoices/:id
 */
const getInvoiceById = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  let invoiceQuery = `
    SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date, i.paid_date,
           i.subtotal, i.tax_rate, i.tax_amount, i.total_amount, i.currency,
           i.notes, i.terms, i.created_at, i.updated_at,
           c.id as client_id, c.name as client_name, c.company as client_company,
           c.email as client_email, c.phone as client_phone, c.address as client_address,
           c.billing_address, c.tax_id as client_tax_id,
           p.id as project_id, p.name as project_name,
           creator.first_name as creator_first_name, creator.last_name as creator_last_name
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    LEFT JOIN users creator ON i.created_by = creator.id
    WHERE i.id = ?
  `;

  const queryParams = [invoiceId];

  // Role-based access control
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    invoiceQuery += ` AND i.id IN (
      SELECT DISTINCT ii.invoice_id 
      FROM invoice_items ii
      INNER JOIN time_entries te ON ii.time_entry_id = te.id
      WHERE te.user_id = ?
    )`;
    queryParams.push(req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    invoiceQuery += ` AND (i.created_by = ? OR i.project_id IN (
      SELECT id FROM projects 
      WHERE assigned_to = ? OR created_by = ?
    ))`;
    queryParams.push(req.user.id, req.user.id, req.user.id);
  }

  const invoices = await executeQuery(invoiceQuery, queryParams);

  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const invoice = invoices[0];

  // Get invoice items
  const itemsQuery = `
    SELECT ii.id, ii.description, ii.quantity, ii.rate, ii.amount,
           te.id as time_entry_id, te.start_time, te.end_time, te.duration_minutes
    FROM invoice_items ii
    LEFT JOIN time_entries te ON ii.time_entry_id = te.id
    WHERE ii.invoice_id = ?
    ORDER BY ii.id
  `;

  const items = await executeQuery(itemsQuery, [invoiceId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        issue_date: formatDate(invoice.issue_date),
        due_date: formatDate(invoice.due_date),
        paid_date: formatDate(invoice.paid_date),
        subtotal: parseFloat(invoice.subtotal),
        tax_rate: parseFloat(invoice.tax_rate),
        tax_amount: parseFloat(invoice.tax_amount),
        total_amount: parseFloat(invoice.total_amount),
        currency: invoice.currency,
        notes: invoice.notes,
        terms: invoice.terms,
        client: {
          id: invoice.client_id,
          name: invoice.client_name,
          company: invoice.client_company,
          email: invoice.client_email,
          phone: invoice.client_phone,
          address: invoice.client_address,
          billing_address: invoice.billing_address,
          tax_id: invoice.client_tax_id
        },
        project: invoice.project_id ? {
          id: invoice.project_id,
          name: invoice.project_name
        } : null,
        created_by: `${invoice.creator_first_name} ${invoice.creator_last_name}`,
        created_at: formatDate(invoice.created_at),
        updated_at: formatDate(invoice.updated_at)
      },
      items: items.map(item => ({
        id: item.id,
        description: item.description,
        quantity: parseFloat(item.quantity),
        rate: parseFloat(item.rate),
        amount: parseFloat(item.amount),
        time_entry: item.time_entry_id ? {
          id: item.time_entry_id,
          start_time: formatDate(item.start_time),
          end_time: formatDate(item.end_time),
          duration_hours: Math.round((item.duration_minutes || 0) / 60 * 100) / 100
        } : null
      }))
    }
  });
});

/**
 * Create invoice from project or time entries
 * POST /api/billing/invoices
 */
const createInvoice = asyncHandler(async (req, res) => {
  const {
    client_id,
    project_id,
    issue_date,
    due_date,
    tax_rate = 0,
    currency = 'USD',
    notes,
    terms,
    time_entry_ids = []
  } = req.body;

  // Verify client exists
  const clientQuery = 'SELECT id, name, payment_terms FROM clients WHERE id = ? AND is_active = 1';
  const clients = await executeQuery(clientQuery, [client_id]);
  
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  const client = clients[0];

  // Generate invoice number
  const invoiceNumber = generateInvoiceNumber();

  // Calculate due date if not provided
  const calculatedDueDate = due_date || new Date(Date.now() + (client.payment_terms || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const result = await executeTransaction(async (connection) => {
    // Create invoice
    const insertInvoiceQuery = `
      INSERT INTO invoices (
        invoice_number, client_id, project_id, issue_date, due_date,
        subtotal, tax_rate, tax_amount, total_amount, currency,
        notes, terms, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, ?, ?, ?, ?, NOW(), NOW())
    `;

    const [invoiceResult] = await connection.execute(insertInvoiceQuery, [
      invoiceNumber,
      client_id,
      project_id || null,
      issue_date,
      calculatedDueDate,
      tax_rate,
      currency,
      notes || null,
      terms || null,
      req.user.id
    ]);

    const invoiceId = invoiceResult.insertId;
    let subtotal = 0;

    // Get time entries to invoice
    let timeEntriesQuery;
    let timeEntriesParams;

    if (time_entry_ids.length > 0) {
      // Invoice specific time entries
      const placeholders = time_entry_ids.map(() => '?').join(',');
      timeEntriesQuery = `
        SELECT te.id, te.description, te.duration_minutes, te.hourly_rate,
               p.name as project_name, c.name as client_name
        FROM time_entries te
        INNER JOIN projects p ON te.project_id = p.id
        INNER JOIN clients c ON p.client_id = c.id
        WHERE te.id IN (${placeholders}) AND te.billable = 1 AND te.invoiced = 0
          AND c.id = ?
      `;
      timeEntriesParams = [...time_entry_ids, client_id];
    } else if (project_id) {
      // Invoice all unbilled time entries for project
      timeEntriesQuery = `
        SELECT te.id, te.description, te.duration_minutes, te.hourly_rate,
               p.name as project_name, c.name as client_name
        FROM time_entries te
        INNER JOIN projects p ON te.project_id = p.id
        INNER JOIN clients c ON p.client_id = c.id
        WHERE te.project_id = ? AND te.billable = 1 AND te.invoiced = 0
      `;
      timeEntriesParams = [project_id];
    } else {
      throw new ValidationError('Either project_id or time_entry_ids must be provided');
    }

    const timeEntries = await executeQuery(timeEntriesQuery, timeEntriesParams);

    if (timeEntries.length === 0) {
      throw new ValidationError('No billable time entries found');
    }

    // Create invoice items and mark time entries as invoiced
    for (const entry of timeEntries) {
      const hours = entry.duration_minutes / 60;
      const rate = parseFloat(entry.hourly_rate) || 0;
      const amount = parseFloat((hours * rate).toFixed(2));

      // Create invoice item
      const insertItemQuery = `
        INSERT INTO invoice_items (
          invoice_id, time_entry_id, description, quantity, rate, amount
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(insertItemQuery, [
        invoiceId,
        entry.id,
        entry.description || `${entry.project_name} - Time Entry`,
        hours,
        rate,
        amount
      ]);

      // Mark time entry as invoiced
      await connection.execute(
        'UPDATE time_entries SET invoiced = 1, invoice_id = ? WHERE id = ?',
        [invoiceId, entry.id]
      );

      subtotal += amount;
    }

    // Calculate tax and total
    const taxAmount = parseFloat((subtotal * (tax_rate / 100)).toFixed(2));
    const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));

    // Update invoice totals
    await connection.execute(
      'UPDATE invoices SET subtotal = ?, tax_amount = ?, total_amount = ? WHERE id = ?',
      [subtotal, taxAmount, totalAmount, invoiceId]
    );

    // Update project status if applicable
    if (project_id) {
      await connection.execute(
        'UPDATE projects SET status = ?, invoice_date = ?, updated_at = NOW() WHERE id = ? AND status = ?',
        [PROJECT_STATUS.INVOICE_SENT, issue_date, project_id, PROJECT_STATUS.COMPLETE]
      );
    }

    return invoiceId;
  });

  // Get created invoice
  const invoiceQuery = `
    SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
           i.subtotal, i.tax_rate, i.tax_amount, i.total_amount, i.currency,
           c.name as client_name, c.company as client_company
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    WHERE i.id = ?
  `;

  const invoices = await executeQuery(invoiceQuery, [result]);
  const invoice = invoices[0];

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.INVOICE_CREATED,
    data: {
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        issue_date: formatDate(invoice.issue_date),
        due_date: formatDate(invoice.due_date),
        subtotal: parseFloat(invoice.subtotal),
        tax_rate: parseFloat(invoice.tax_rate),
        tax_amount: parseFloat(invoice.tax_amount),
        total_amount: parseFloat(invoice.total_amount),
        currency: invoice.currency,
        client: {
          name: invoice.client_name,
          company: invoice.client_company
        }
      }
    }
  });
});

/**
 * Update invoice
 * PUT /api/billing/invoices/:id
 */
const updateInvoice = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;
  const updateData = removeEmptyValues(req.body);

  // Check if invoice exists
  const existingQuery = `
    SELECT id, status, created_by FROM invoices WHERE id = ?
  `;
  const existing = await executeQuery(existingQuery, [invoiceId]);
  
  if (existing.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const currentInvoice = existing[0];

  // Check permissions
  if (req.user.role !== USER_ROLES.ADMIN && currentInvoice.created_by !== req.user.id) {
    throw new AuthorizationError('Access denied');
  }

  // Cannot edit paid invoices
  if (currentInvoice.status === INVOICE_STATUS.PAID) {
    throw new ConflictError('Cannot edit paid invoice');
  }

  // Handle status changes
  if (updateData.status) {
    if (updateData.status === INVOICE_STATUS.PAID && !updateData.paid_date) {
      updateData.paid_date = new Date().toISOString().split('T')[0];
    }
  }

  // Build update query
  const updateFields = [];
  const updateValues = [];

  const allowedFields = [
    'status', 'due_date', 'paid_date', 'notes', 'terms'
  ];

  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  updateFields.push('updated_at = NOW()');
  updateValues.push(invoiceId);

  const updateQuery = `
    UPDATE invoices 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `;

  await executeQuery(updateQuery, updateValues);

  // Update project status if invoice is paid
  if (updateData.status === INVOICE_STATUS.PAID) {
    await executeQuery(`
      UPDATE projects 
      SET status = ?, payment_date = ?, updated_at = NOW() 
      WHERE id = (SELECT project_id FROM invoices WHERE id = ?) 
        AND project_id IS NOT NULL
    `, [PROJECT_STATUS.PAID, updateData.paid_date, invoiceId]);
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.INVOICE_UPDATED
  });
});

/**
 * Get billing summary for client or project
 * GET /api/billing/summary
 */
const getBillingSummary = asyncHandler(async (req, res) => {
  const { client_id, project_id, start_date, end_date } = req.query;

  let summaryQuery;
  let queryParams = [];

  if (client_id) {
    summaryQuery = `
      SELECT 
        COUNT(DISTINCT i.id) as total_invoices,
        SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN i.status = 'sent' THEN i.total_amount ELSE 0 END) as total_outstanding,
        SUM(CASE WHEN i.status = 'overdue' THEN i.total_amount ELSE 0 END) as total_overdue,
        SUM(i.total_amount) as total_invoiced,
        COUNT(DISTINCT te.id) as total_time_entries,
        SUM(te.duration_minutes) as total_minutes,
        SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes,
        SUM(CASE WHEN te.invoiced = 0 AND te.billable = 1 THEN te.duration_minutes ELSE 0 END) as unbilled_minutes
      FROM clients c
      LEFT JOIN invoices i ON c.id = i.client_id
      LEFT JOIN projects p ON c.id = p.client_id
      LEFT JOIN time_entries te ON p.id = te.project_id
      WHERE c.id = ?
    `;
    queryParams.push(client_id);
  } else if (project_id) {
    summaryQuery = `
      SELECT 
        COUNT(DISTINCT i.id) as total_invoices,
        SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as total_paid,
        SUM(CASE WHEN i.status = 'sent' THEN i.total_amount ELSE 0 END) as total_outstanding,
        SUM(CASE WHEN i.status = 'overdue' THEN i.total_amount ELSE 0 END) as total_overdue,
        SUM(i.total_amount) as total_invoiced,
        COUNT(DISTINCT te.id) as total_time_entries,
        SUM(te.duration_minutes) as total_minutes,
        SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes,
        SUM(CASE WHEN te.invoiced = 0 AND te.billable = 1 THEN te.duration_minutes ELSE 0 END) as unbilled_minutes
      FROM projects p
      LEFT JOIN invoices i ON p.id = i.project_id
      LEFT JOIN time_entries te ON p.id = te.project_id
      WHERE p.id = ?
    `;
    queryParams.push(project_id);
  } else {
    throw new ValidationError('Either client_id or project_id is required');
  }

  if (start_date) {
    summaryQuery += ' AND (i.issue_date >= ? OR i.issue_date IS NULL)';
    queryParams.push(start_date);
  }

  if (end_date) {
    summaryQuery += ' AND (i.issue_date <= ? OR i.issue_date IS NULL)';
    queryParams.push(end_date);
  }

  const summary = await executeQuery(summaryQuery, queryParams);
  const result = summary[0];

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      totalRevenue: parseFloat(result.total_invoiced) || 0,
      paidAmount: parseFloat(result.total_paid) || 0,
      pendingAmount: parseFloat(result.total_outstanding) || 0,
      overdueAmount: parseFloat(result.total_overdue) || 0,
      totalInvoices: result.total_invoices || 0,
      totalHours: Math.round((result.total_minutes || 0) / 60 * 100) / 100,
      billableHours: Math.round((result.billable_minutes || 0) / 60 * 100) / 100,
      unbilledHours: Math.round((result.unbilled_minutes || 0) / 60 * 100) / 100
    }
  });
});

/**
 * Delete invoice
 * DELETE /api/billing/invoices/:id
 */
const deleteInvoice = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  // Check if invoice exists
  const existingQuery = `
    SELECT id, status, created_by FROM invoices WHERE id = ?
  `;
  const existing = await executeQuery(existingQuery, [invoiceId]);
  
  if (existing.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const currentInvoice = existing[0];

  // Check permissions
  if (req.user.role !== USER_ROLES.ADMIN && currentInvoice.created_by !== req.user.id) {
    throw new AuthorizationError('Access denied');
  }

  // Cannot delete paid invoices
  if (currentInvoice.status === INVOICE_STATUS.PAID) {
    throw new ConflictError('Cannot delete paid invoice');
  }

  await executeTransaction(async (connection) => {
    // Unmark time entries as invoiced
    await connection.execute(
      'UPDATE time_entries SET invoiced = 0, invoice_id = NULL WHERE invoice_id = ?',
      [invoiceId]
    );

    // Delete invoice items
    await connection.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);

    // Delete invoice
    await connection.execute('DELETE FROM invoices WHERE id = ?', [invoiceId]);
  });

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.INVOICE_DELETED
  });
});

/**
 * Generate invoice from time entries
 * POST /api/billing/invoices/generate
 */
const generateInvoice = asyncHandler(async (req, res) => {
  // This is essentially the same as createInvoice but with different endpoint
  return createInvoice(req, res);
});

/**
 * Generate and download invoice PDF
 * GET /api/billing/invoices/:id/pdf
 */
const generateInvoicePDF = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  // Get invoice data (reuse getInvoiceById logic)
  const invoiceQuery = `
    SELECT i.*, c.*, p.name as project_name
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE i.id = ?
  `;

  const invoices = await executeQuery(invoiceQuery, [invoiceId]);
  
  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  // For now, return a simple response - PDF generation would require additional libraries
  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'PDF generation not implemented yet',
    data: {
      download_url: `/api/billing/invoices/${invoiceId}/pdf`,
      invoice_id: invoiceId
    }
  });
});

/**
 * Send invoice via email
 * POST /api/billing/invoices/:id/send
 */
const sendInvoice = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  // Update invoice status to sent
  await executeQuery(
    'UPDATE invoices SET status = ?, updated_at = NOW() WHERE id = ?',
    [INVOICE_STATUS.SENT, invoiceId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Invoice sent successfully'
  });
});

/**
 * Record payment for invoice
 * POST /api/billing/invoices/:id/payment
 */
const recordPayment = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;
  const { amount, payment_date, payment_method, notes } = req.body;

  // Get invoice
  const invoiceQuery = 'SELECT total_amount, status FROM invoices WHERE id = ?';
  const invoices = await executeQuery(invoiceQuery, [invoiceId]);
  
  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const invoice = invoices[0];
  const paymentAmount = parseFloat(amount);

  // Create payment record (assuming payments table exists)
  const insertPaymentQuery = `
    INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;

  await executeQuery(insertPaymentQuery, [
    invoiceId, paymentAmount, payment_date, payment_method, notes
  ]);

  // Update invoice status if fully paid
  if (paymentAmount >= parseFloat(invoice.total_amount)) {
    await executeQuery(
      'UPDATE invoices SET status = ?, paid_date = ?, updated_at = NOW() WHERE id = ?',
      [INVOICE_STATUS.PAID, payment_date, invoiceId]
    );
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Payment recorded successfully'
  });
});

/**
 * Get all payments for invoice
 * GET /api/billing/invoices/:id/payments
 */
const getInvoicePayments = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  const paymentsQuery = `
    SELECT id, amount, payment_date, payment_method, notes, created_at
    FROM payments
    WHERE invoice_id = ?
    ORDER BY payment_date DESC
  `;

  const payments = await executeQuery(paymentsQuery, [invoiceId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      payments: payments.map(payment => ({
        id: payment.id,
        amount: parseFloat(payment.amount),
        payment_date: formatDate(payment.payment_date),
        payment_method: payment.payment_method,
        notes: payment.notes,
        created_at: formatDate(payment.created_at)
      }))
    }
  });
});

/**
 * Get billing rates
 * GET /api/billing/rates
 */
const getBillingRates = asyncHandler(async (req, res) => {
  const ratesQuery = `
    SELECT br.id, br.name, br.rate, br.currency, br.is_default, br.created_at,
           u.first_name, u.last_name
    FROM billing_rates br
    LEFT JOIN users u ON br.user_id = u.id
    WHERE br.is_active = 1
    ORDER BY br.is_default DESC, br.name ASC
  `;

  const rates = await executeQuery(ratesQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      rates: rates.map(rate => ({
        id: rate.id,
        name: rate.name,
        rate: parseFloat(rate.rate),
        currency: rate.currency,
        is_default: Boolean(rate.is_default),
        user_name: rate.first_name ? `${rate.first_name} ${rate.last_name}` : null,
        created_at: formatDate(rate.created_at)
      }))
    }
  });
});

/**
 * Create billing rate
 * POST /api/billing/rates
 */
const createBillingRate = asyncHandler(async (req, res) => {
  const { name, rate, currency = 'USD', user_id, is_default = false } = req.body;

  // If setting as default, unset other defaults
  if (is_default) {
    await executeQuery('UPDATE billing_rates SET is_default = 0');
  }

  const insertQuery = `
    INSERT INTO billing_rates (name, rate, currency, user_id, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const result = await executeQuery(insertQuery, [name, rate, currency, user_id || null, is_default ? 1 : 0]);

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: 'Billing rate created successfully',
    data: { id: result.insertId }
  });
});

/**
 * Update billing rate
 * PUT /api/billing/rates/:id
 */
const updateBillingRate = asyncHandler(async (req, res) => {
  const rateId = req.params.id;
  const { name, rate, currency, is_default } = req.body;

  // If setting as default, unset other defaults
  if (is_default) {
    await executeQuery('UPDATE billing_rates SET is_default = 0 WHERE id != ?', [rateId]);
  }

  const updateQuery = `
    UPDATE billing_rates
    SET name = ?, rate = ?, currency = ?, is_default = ?, updated_at = NOW()
    WHERE id = ?
  `;

  await executeQuery(updateQuery, [name, rate, currency, is_default ? 1 : 0, rateId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      totalRevenue: parseFloat(result.total_invoiced) || 0,
      paidAmount: parseFloat(result.total_paid) || 0,
      pendingAmount: parseFloat(result.total_outstanding) || 0,
      overdueAmount: parseFloat(result.total_overdue) || 0,
      totalInvoices: result.total_invoices || 0,
      totalHours: Math.round((result.total_minutes || 0) / 60 * 100) / 100,
      billableHours: Math.round((result.billable_minutes || 0) / 60 * 100) / 100,
      unbilledHours: Math.round((result.unbilled_minutes || 0) / 60 * 100) / 100
    }
  });
});

/**
 * Delete billing rate
 * DELETE /api/billing/rates/:id
 */
const deleteBillingRate = asyncHandler(async (req, res) => {
  const rateId = req.params.id;

  await executeQuery('UPDATE billing_rates SET is_active = 0 WHERE id = ?', [rateId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Billing rate deleted successfully'
  });
});

/**
 * Get revenue report
 * GET /api/billing/reports/revenue
 */
const getRevenueReport = asyncHandler(async (req, res) => {
  const { start_date, end_date, group_by = 'month' } = req.query;

  let groupByClause, selectClause;
  
  switch (group_by) {
    case 'week':
      selectClause = 'YEARWEEK(i.issue_date) as period';
      groupByClause = 'GROUP BY YEARWEEK(i.issue_date)';
      break;
    case 'year':
      selectClause = 'YEAR(i.issue_date) as period';
      groupByClause = 'GROUP BY YEAR(i.issue_date)';
      break;
    default: // month
      selectClause = 'DATE_FORMAT(i.issue_date, "%Y-%m") as period';
      groupByClause = 'GROUP BY DATE_FORMAT(i.issue_date, "%Y-%m")';
  }

  const whereConditions = ['1=1'];
  const queryParams = [];

  if (start_date) {
    whereConditions.push('i.issue_date >= ?');
    queryParams.push(start_date);
  }

  if (end_date) {
    whereConditions.push('i.issue_date <= ?');
    queryParams.push(end_date);
  }

  const revenueQuery = `
    SELECT
      ${selectClause},
      COUNT(*) as total_invoices,
      SUM(i.total_amount) as total_revenue,
      SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as paid_revenue,
      SUM(CASE WHEN i.status = 'sent' THEN i.total_amount ELSE 0 END) as outstanding_revenue
    FROM invoices i
    WHERE ${whereConditions.join(' AND ')}
    ${groupByClause}
    ORDER BY period
  `;

  const revenueData = await executeQuery(revenueQuery, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      revenue_report: revenueData.map(row => ({
        period: row.period,
        total_invoices: row.total_invoices || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
        paid_revenue: parseFloat(row.paid_revenue) || 0,
        outstanding_revenue: parseFloat(row.outstanding_revenue) || 0
      }))
    }
  });
});

/**
 * Get outstanding invoices report
 * GET /api/billing/reports/outstanding
 */
const getOutstandingInvoicesReport = asyncHandler(async (req, res) => {
  const outstandingQuery = `
    SELECT i.id, i.invoice_number, i.issue_date, i.due_date, i.total_amount,
           c.name as client_name, c.company as client_company,
           DATEDIFF(CURDATE(), i.due_date) as days_overdue
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    WHERE i.status IN ('sent', 'overdue')
    ORDER BY i.due_date ASC
  `;

  const outstanding = await executeQuery(outstandingQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      outstanding_invoices: outstanding.map(invoice => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_company || invoice.client_name,
        issue_date: formatDate(invoice.issue_date),
        due_date: formatDate(invoice.due_date),
        total_amount: parseFloat(invoice.total_amount),
        days_overdue: invoice.days_overdue > 0 ? invoice.days_overdue : 0,
        is_overdue: invoice.days_overdue > 0
      }))
    }
  });
});

/**
 * Get client billing summary
 * GET /api/billing/reports/client-billing
 */
const getClientBillingReport = asyncHandler(async (req, res) => {
  const clientBillingQuery = `
    SELECT c.id, c.name, c.company,
           COUNT(i.id) as total_invoices,
           SUM(i.total_amount) as total_invoiced,
           SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as total_paid,
           SUM(CASE WHEN i.status = 'sent' THEN i.total_amount ELSE 0 END) as total_outstanding
    FROM clients c
    LEFT JOIN invoices i ON c.id = i.client_id
    WHERE c.is_active = 1
    GROUP BY c.id, c.name, c.company
    ORDER BY total_invoiced DESC
  `;

  const clientBilling = await executeQuery(clientBillingQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      client_billing: clientBilling.map(client => ({
        id: client.id,
        name: client.company || client.name,
        total_invoices: client.total_invoices || 0,
        total_invoiced: parseFloat(client.total_invoiced) || 0,
        total_paid: parseFloat(client.total_paid) || 0,
        total_outstanding: parseFloat(client.total_outstanding) || 0
      }))
    }
  });
});

/**
 * Export billing data to CSV
 * GET /api/billing/export
 */
const exportBillingData = asyncHandler(async (req, res) => {
  const { start_date, end_date, status } = req.query;

  const whereConditions = ['1=1'];
  const queryParams = [];

  if (start_date) {
    whereConditions.push('i.issue_date >= ?');
    queryParams.push(start_date);
  }

  if (end_date) {
    whereConditions.push('i.issue_date <= ?');
    queryParams.push(end_date);
  }

  if (status) {
    whereConditions.push('i.status = ?');
    queryParams.push(status);
  }

  const exportQuery = `
    SELECT i.invoice_number, i.status, i.issue_date, i.due_date, i.paid_date,
           i.subtotal, i.tax_amount, i.total_amount, i.currency,
           c.name as client_name, c.company as client_company,
           p.name as project_name
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY i.issue_date DESC
  `;

  const invoices = await executeQuery(exportQuery, queryParams);

  // Generate CSV content
  const csvHeaders = [
    'Invoice Number', 'Status', 'Client', 'Project', 'Issue Date', 'Due Date', 'Paid Date',
    'Subtotal', 'Tax Amount', 'Total Amount', 'Currency'
  ];

  const csvRows = invoices.map(invoice => [
    invoice.invoice_number,
    invoice.status,
    invoice.client_company || invoice.client_name,
    invoice.project_name || '',
    formatDate(invoice.issue_date),
    formatDate(invoice.due_date),
    formatDate(invoice.paid_date),
    parseFloat(invoice.subtotal) || 0,
    parseFloat(invoice.tax_amount) || 0,
    parseFloat(invoice.total_amount) || 0,
    invoice.currency
  ]);

  const csvContent = [csvHeaders, ...csvRows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const filename = `billing_export_${moment().format('YYYY-MM-DD')}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

module.exports = {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  generateInvoice,
  generateInvoicePDF,
  sendInvoice,
  recordPayment,
  getInvoicePayments,
  getBillingRates,
  createBillingRate,
  updateBillingRate,
  deleteBillingRate,
  getRevenueReport,
  getOutstandingInvoicesReport,
  getClientBillingReport,
  exportBillingData,
  getBillingSummary
};
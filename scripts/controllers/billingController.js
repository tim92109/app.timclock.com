/**
 * Billing Controller
 * Handles invoice generation and billing operations
 */

const moment = require('moment');
const PDFDocument = require('pdfkit');
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
  removeEmptyValues,
  employeeProjectAccess,
  pushEmployeeProjectAccessParams
} = require('../utils/helpers');

/**
 * Settle an invoice through a single shared path.
 *
 * Marks the invoice paid, records exactly one payments row for the invoice
 * total, and reflects the payment on the related project. Pass
 * options.connection to run inside an existing transaction; otherwise the
 * pool is used.
 *
 * @param {number|string} invoiceId
 * @param {string} paidDate
 * @param {Object} [options]
 * @param {Object} [options.connection] - Transaction connection (optional)
 * @param {number} [options.amount] - Payment amount (defaults to invoice total)
 * @param {string} [options.paymentMethod] - Defaults to 'manual'
 * @param {string} [options.notes]
 * @param {number} [options.createdBy] - User id recorded on the payment
 */
const settleInvoice = async (invoiceId, paidDate, options = {}) => {
  const { connection } = options;
  const paymentMethod = options.paymentMethod || options.payment_method || 'manual';
  const notes = options.notes !== undefined ? options.notes : null;
  const createdBy = options.createdBy !== undefined
    ? options.createdBy
    : (options.created_by !== undefined ? options.created_by : null);

  const runQuery = async (query, params = []) => {
    if (connection) {
      const [rows] = await connection.execute(query, params);
      return rows;
    }
    return executeQuery(query, params);
  };

  // Resolve the invoice total unless the caller supplied the amount.
  let totalAmount = options.amount;
  if (totalAmount === undefined || totalAmount === null) {
    const rows = await runQuery('SELECT total_amount FROM invoices WHERE id = ?', [invoiceId]);
    totalAmount = rows.length > 0 ? rows[0].total_amount : 0;
  }

  await runQuery(
    'UPDATE invoices SET status = ?, paid_date = ?, updated_at = NOW() WHERE id = ?',
    [INVOICE_STATUS.PAID, paidDate, invoiceId]
  );

  // Exactly one payment row for the settlement.
  await runQuery(
    `INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [invoiceId, totalAmount, paidDate, paymentMethod, notes, createdBy]
  );

  // Reflect the payment on the related project. A NULL project_id matches no
  // row, so invoices without a project are safely ignored.
  await runQuery(`
    UPDATE projects
    SET status = ?, payment_date = ?, updated_at = NOW()
    WHERE id = (SELECT project_id FROM invoices WHERE id = ?)
  `, [PROJECT_STATUS.PAID, paidDate, invoiceId]);
};

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
  } else if (req.user.role === USER_ROLES.CONTRACTOR) {
    // Contractors only see invoices they created
    whereConditions.push('i.created_by = ?');
    queryParams.push(req.user.id);
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
           i.discount_type, i.discount_value, i.discount_amount,
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
    discount_type: invoice.discount_type || 'amount',
    discount_value: parseFloat(invoice.discount_value) || 0,
    discount_amount: parseFloat(invoice.discount_amount) || 0,
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
           i.discount_type, i.discount_value, i.discount_amount,
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
  } else if (req.user.role === USER_ROLES.CONTRACTOR) {
    invoiceQuery += ' AND i.created_by = ?';
    queryParams.push(req.user.id);
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
        discount_type: invoice.discount_type || 'amount',
        discount_value: parseFloat(invoice.discount_value) || 0,
        discount_amount: parseFloat(invoice.discount_amount) || 0,
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
    discount_type = 'amount',
    discount_value = 0,
    currency = 'USD',
    notes,
    terms,
    time_entry_ids = [],
    // UI convenience fields: a free-form invoice line and a flag to pull in a
    // project's unbilled time.
    amount,
    description,
    include_time_entries
  } = req.body;

  // Verify client exists
  const clientQuery = 'SELECT id FROM clients WHERE id = ? AND is_active = 1';
  const clients = await executeQuery(clientQuery, [client_id]);
  
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // The UI create form does not collect an issue date; default to today.
  const effectiveIssueDate = issue_date || new Date().toISOString().split('T')[0];

  // Generate invoice number
  const invoiceNumber = generateInvoiceNumber();

  // Due date is optional; leave it empty unless the caller supplied one.
  const effectiveDueDate = due_date || null;

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
      effectiveIssueDate,
      effectiveDueDate,
      tax_rate,
      currency,
      notes || null,
      terms || null,
      req.user.id
    ]);

    const invoiceId = invoiceResult.insertId;
    let subtotal = 0;

    const hasTimeEntryIds = Array.isArray(time_entry_ids) && time_entry_ids.length > 0;
    const hasAmount = amount !== undefined && amount !== null && amount !== '' && !Number.isNaN(Number(amount));
    const includeProjectEntries =
      Boolean(project_id) &&
      (include_time_entries === true || include_time_entries === 'true' || !hasAmount);

    // Get time entries to invoice
    let timeEntries = [];

    if (hasTimeEntryIds) {
      // Invoice specific time entries
      const placeholders = time_entry_ids.map(() => '?').join(',');
      const timeEntriesQuery = `
        SELECT te.id, te.description, te.duration_minutes, te.hourly_rate,
               t.name AS task_name,
               p.name as project_name, c.name as client_name
        FROM time_entries te
        INNER JOIN projects p ON te.project_id = p.id
        INNER JOIN clients c ON p.client_id = c.id
        LEFT JOIN tasks t ON te.task_id = t.id
        WHERE te.id IN (${placeholders}) AND te.billable = 1 AND te.invoiced = 0
          AND c.id = ?
      `;
      const [timeEntryRows] = await connection.execute(timeEntriesQuery, [...time_entry_ids, client_id]);
      timeEntries = timeEntryRows;
    } else if (includeProjectEntries) {
      // Invoice all unbilled time entries for project
      const timeEntriesQuery = `
        SELECT te.id, te.description, te.duration_minutes, te.hourly_rate,
               t.name AS task_name,
               p.name as project_name, c.name as client_name
        FROM time_entries te
        INNER JOIN projects p ON te.project_id = p.id
        INNER JOIN clients c ON p.client_id = c.id
        LEFT JOIN tasks t ON te.task_id = t.id
        WHERE te.project_id = ? AND te.billable = 1 AND te.invoiced = 0
      `;
      const [timeEntryRows] = await connection.execute(timeEntriesQuery, [project_id]);
      timeEntries = timeEntryRows;
    }

    // Create invoice items and mark time entries as invoiced
    for (const entry of timeEntries) {
      const hours = entry.duration_minutes / 60;
      const rate = parseFloat(entry.hourly_rate) || 0;
      const entryAmount = parseFloat((hours * rate).toFixed(2));

      // Prefer the task name as the primary label, appending the entry's own
      // description when present. Fall back to the raw description, then to a
      // generic project-based label.
      const itemDescription = entry.task_name
        ? `${entry.task_name}${entry.description ? ` — ${entry.description}` : ''}`
        : (entry.description || `${entry.project_name} - Time Entry`);

      // Create invoice item
      const insertItemQuery = `
        INSERT INTO invoice_items (
          invoice_id, time_entry_id, description, quantity, rate, amount
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      await connection.execute(insertItemQuery, [
        invoiceId,
        entry.id,
        itemDescription,
        hours,
        rate,
        entryAmount
      ]);

      // Mark time entry as invoiced
      await connection.execute(
        'UPDATE time_entries SET invoiced = 1, invoice_id = ? WHERE id = ?',
        [invoiceId, entry.id]
      );

      subtotal += entryAmount;
    }

    // Add the free-form line item entered in the UI.
    if (hasAmount) {
      const manualAmount = parseFloat(Number(amount).toFixed(2));
      await connection.execute(
        `INSERT INTO invoice_items (invoice_id, time_entry_id, description, quantity, rate, amount)
         VALUES (?, NULL, ?, 1, ?, ?)`,
        [invoiceId, description || notes || 'Services', manualAmount, manualAmount]
      );
      subtotal += manualAmount;
    }

    if (subtotal <= 0) {
      throw new ValidationError('No billable time entries or amount provided');
    }

    // Apply the optional discount before tax. A percent discount is taken from
    // the subtotal; a fixed discount is clamped so it can never exceed the
    // subtotal (which also keeps the total from going negative).
    const effectiveDiscountType = discount_type === 'percent' ? 'percent' : 'amount';
    const effectiveDiscountValue = parseFloat(discount_value) || 0;
    const rawDiscount = effectiveDiscountType === 'percent'
      ? subtotal * (effectiveDiscountValue / 100)
      : effectiveDiscountValue;
    const discountAmount = parseFloat(
      Math.max(0, Math.min(rawDiscount, subtotal)).toFixed(2)
    );
    const taxable = parseFloat((subtotal - discountAmount).toFixed(2));

    // Calculate tax and total on the discounted (taxable) amount.
    const taxAmount = parseFloat((taxable * ((parseFloat(tax_rate) || 0) / 100)).toFixed(2));
    const totalAmount = parseFloat((taxable + taxAmount).toFixed(2));

    // Update invoice totals
    await connection.execute(
      `UPDATE invoices
       SET subtotal = ?, discount_type = ?, discount_value = ?, discount_amount = ?,
           tax_amount = ?, total_amount = ?
       WHERE id = ?`,
      [
        subtotal,
        effectiveDiscountType,
        effectiveDiscountValue,
        discountAmount,
        taxAmount,
        totalAmount,
        invoiceId
      ]
    );

    // Update project status if applicable
    if (project_id) {
      await connection.execute(
        'UPDATE projects SET status = ?, invoice_date = ?, updated_at = NOW() WHERE id = ? AND status = ?',
        [PROJECT_STATUS.INVOICE_SENT, effectiveIssueDate, project_id, PROJECT_STATUS.COMPLETE]
      );
    }

    return invoiceId;
  });

  // Get created invoice
  const invoiceQuery = `
    SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
           i.subtotal, i.tax_rate, i.tax_amount, i.total_amount, i.currency,
           i.discount_type, i.discount_value, i.discount_amount,
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
        discount_type: invoice.discount_type || 'amount',
        discount_value: parseFloat(invoice.discount_value) || 0,
        discount_amount: parseFloat(invoice.discount_amount) || 0,
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
    SELECT id, status, created_by, subtotal, discount_type, discount_value, tax_rate
    FROM invoices WHERE id = ?
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
    'status', 'due_date', 'paid_date', 'notes', 'terms',
    'discount_type', 'discount_value', 'tax_rate'
  ];

  for (const [key, value] of Object.entries(updateData)) {
    if (allowedFields.includes(key)) {
      updateFields.push(`${key} = ?`);
      updateValues.push(value);
    }
  }

  // Recompute the discount, tax and total from the invoice's current subtotal
  // whenever any of the three inputs that drive them is provided. Unchanged
  // inputs fall back to the stored values.
  const touchesTotals = ['discount_type', 'discount_value', 'tax_rate']
    .some((key) => updateData[key] !== undefined);

  if (touchesTotals) {
    const subtotal = parseFloat(currentInvoice.subtotal) || 0;
    const effectiveDiscountType = (updateData.discount_type !== undefined
      ? updateData.discount_type
      : currentInvoice.discount_type) === 'percent' ? 'percent' : 'amount';
    const effectiveDiscountValue = updateData.discount_value !== undefined
      ? (parseFloat(updateData.discount_value) || 0)
      : (parseFloat(currentInvoice.discount_value) || 0);
    const effectiveTaxRate = updateData.tax_rate !== undefined
      ? (parseFloat(updateData.tax_rate) || 0)
      : (parseFloat(currentInvoice.tax_rate) || 0);

    const rawDiscount = effectiveDiscountType === 'percent'
      ? subtotal * (effectiveDiscountValue / 100)
      : effectiveDiscountValue;
    const discountAmount = parseFloat(
      Math.max(0, Math.min(rawDiscount, subtotal)).toFixed(2)
    );
    const taxable = parseFloat((subtotal - discountAmount).toFixed(2));
    const taxAmount = parseFloat((taxable * (effectiveTaxRate / 100)).toFixed(2));
    const totalAmount = parseFloat((taxable + taxAmount).toFixed(2));

    updateFields.push('discount_amount = ?', 'tax_amount = ?', 'total_amount = ?');
    updateValues.push(discountAmount, taxAmount, totalAmount);
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

  // When transitioning to paid, apply the shared settlement side effects
  // (payment row + project PAID/payment_date) through the single settle path.
  if (updateData.status === INVOICE_STATUS.PAID) {
    await settleInvoice(invoiceId, updateData.paid_date, {
      paymentMethod: updateData.payment_method,
      createdBy: req.user.id
    });
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

  const isContractor = req.user.role === USER_ROLES.CONTRACTOR;

  if (isContractor && client_id) {
    const ownedClient = await executeQuery(
      'SELECT id FROM clients WHERE id = ? AND created_by = ?',
      [client_id, req.user.id]
    );
    if (ownedClient.length === 0) {
      throw new NotFoundError('Client not found');
    }
  }

  if (isContractor && project_id) {
    const ownedProject = await executeQuery(
      `SELECT p.id FROM projects p WHERE p.id = ? AND ${employeeProjectAccess('p')}`,
      [project_id, req.user.id, req.user.id, req.user.id]
    );
    if (ownedProject.length === 0) {
      throw new NotFoundError('Project not found');
    }
  }

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
      ${isContractor ? 'AND (i.created_by = ? OR i.id IS NULL)' : ''}
    `;
    queryParams.push(client_id);
    if (isContractor) {
      queryParams.push(req.user.id);
    }
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
      ${isContractor ? 'AND (i.created_by = ? OR i.id IS NULL)' : ''}
    `;
    queryParams.push(project_id);
    if (isContractor) {
      queryParams.push(req.user.id);
    }
  } else {
    // No filter: overall summary. Invoices and time entries are aggregated in
    // separate derived tables so the invoice totals are not inflated by the
    // time-entry fan-out of a JOIN. Each derived table carries its own params
    // so placeholder order always matches the SQL.
    const invoiceConditions = [];
    const invoiceParams = [];
    const timeEntryConditions = [];
    const timeEntryParams = [];

    if (isContractor) {
      invoiceConditions.push('created_by = ?');
      invoiceParams.push(req.user.id);

      // Contractors only see time totals for projects they can access.
      timeEntryConditions.push(
        `project_id IN (SELECT id FROM projects p WHERE ${employeeProjectAccess('p')})`
      );
      pushEmployeeProjectAccessParams(timeEntryParams, req.user.id);
    }

    if (start_date) {
      invoiceConditions.push('issue_date >= ?');
      invoiceParams.push(start_date);
      timeEntryConditions.push('start_time >= ?');
      timeEntryParams.push(start_date);
    }

    if (end_date) {
      invoiceConditions.push('issue_date <= ?');
      invoiceParams.push(end_date);
      timeEntryConditions.push('start_time <= ?');
      timeEntryParams.push(end_date);
    }

    const invoiceWhere = invoiceConditions.length > 0
      ? `WHERE ${invoiceConditions.join(' AND ')}`
      : '';
    const timeEntryWhere = timeEntryConditions.length > 0
      ? `WHERE ${timeEntryConditions.join(' AND ')}`
      : '';

    // Parameter order follows placeholder order in the SQL below: all invoice
    // conditions first, then all time-entry conditions.
    queryParams = [...invoiceParams, ...timeEntryParams];

    summaryQuery = `
      SELECT
        inv.total_invoices,
        inv.total_paid,
        inv.total_outstanding,
        inv.total_overdue,
        inv.total_invoiced,
        te.total_time_entries,
        te.total_minutes,
        te.billable_minutes,
        te.unbilled_minutes
      FROM (
        SELECT
          COUNT(*) as total_invoices,
          COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN status = 'sent' THEN total_amount ELSE 0 END), 0) as total_outstanding,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0) as total_overdue,
          COALESCE(SUM(total_amount), 0) as total_invoiced
        FROM invoices
        ${invoiceWhere}
      ) inv
      CROSS JOIN (
        SELECT
          COUNT(*) as total_time_entries,
          COALESCE(SUM(duration_minutes), 0) as total_minutes,
          COALESCE(SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END), 0) as billable_minutes,
          COALESCE(SUM(CASE WHEN invoiced = 0 AND billable = 1 THEN duration_minutes ELSE 0 END), 0) as unbilled_minutes
        FROM time_entries
        ${timeEntryWhere}
      ) te
    `;
  }

  if ((client_id || project_id) && start_date) {
    summaryQuery += ' AND (i.issue_date >= ? OR i.issue_date IS NULL)';
    queryParams.push(start_date);
  }

  if ((client_id || project_id) && end_date) {
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
 * Render an invoice as a real PDF document and stream it to the response.
 * Text drawn with pdfkit needs no HTML escaping; only the download filename
 * is sanitized to safe characters.
 * GET /api/billing/invoices/:id/pdf  (and the /download alias)
 */
const generateInvoicePDF = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  // Get invoice data (reuse getInvoiceById logic)
  let invoiceQuery = `
    SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date, i.paid_date,
           i.subtotal, i.tax_rate, i.tax_amount, i.total_amount, i.currency,
           i.discount_type, i.discount_value, i.discount_amount,
           i.notes, i.terms,
           c.name as client_name, c.company as client_company, c.email as client_email,
           c.phone as client_phone, c.address as client_address,
           c.billing_address as client_billing_address, c.tax_id as client_tax_id,
           p.name as project_name
    FROM invoices i
    INNER JOIN clients c ON i.client_id = c.id
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE i.id = ?
  `;
  const invoiceParams = [invoiceId];

  // Contractors may only download PDFs for invoices they created.
  if (req.user.role === USER_ROLES.CONTRACTOR) {
    invoiceQuery += ' AND i.created_by = ?';
    invoiceParams.push(req.user.id);
  }

  const invoices = await executeQuery(invoiceQuery, invoiceParams);

  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const invoice = invoices[0];

  // Invoice line items.
  const items = await executeQuery(
    'SELECT description, quantity, rate, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id',
    [invoiceId]
  );

  // Only accept a well-formed ISO currency code so formatting can never throw.
  const currency = /^[A-Za-z]{3}$/.test(String(invoice.currency || ''))
    ? String(invoice.currency).toUpperCase()
    : 'USD';
  const money = (value) => formatCurrency(parseFloat(value) || 0, currency);

  const issueDate = invoice.issue_date ? moment(invoice.issue_date).format('MMM D, YYYY') : null;
  const dueDate = invoice.due_date ? moment(invoice.due_date).format('MMM D, YYYY') : null;
  const status = ['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(String(invoice.status))
    ? String(invoice.status)
    : 'draft';
  const invoiceNumber = String(invoice.invoice_number || invoiceId);
  const safeFilename = invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_');

  const discountAmount = parseFloat(invoice.discount_amount) || 0;
  const discountType = invoice.discount_type === 'percent' ? 'percent' : 'amount';
  const discountValue = parseFloat(invoice.discount_value) || 0;
  const taxAmount = parseFloat(invoice.tax_amount) || 0;
  const taxRate = parseFloat(invoice.tax_rate) || 0;

  // Bill To lines: name, company, email, phone and the best available address.
  const billTo = [
    invoice.client_name,
    invoice.client_company,
    invoice.client_email,
    invoice.client_phone,
    invoice.client_billing_address || invoice.client_address
  ].filter(Boolean);

  // Set up the PDF stream.
  const MARGIN = 50;
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${safeFilename}.pdf"`);
  doc.pipe(res);

  // Column geometry for the line-items table (A4 content width ~495pt).
  const COL = {
    desc: MARGIN, descW: 240,
    qty: 300, qtyW: 50,
    rate: 360, rateW: 75,
    amount: 445, amountW: 100
  };
  const RIGHT = MARGIN + 495;

  let y = MARGIN;
  const bottom = () => doc.page.height - MARGIN;

  // Move to a new page when the next block would overflow the bottom margin.
  const ensureSpace = (height) => {
    if (y + height > bottom()) {
      doc.addPage();
      y = MARGIN;
      return true;
    }
    return false;
  };

  // Header row for the line-items table; redrawn after every page break.
  const drawItemsHeader = () => {
    doc.rect(MARGIN, y, RIGHT - MARGIN, 20).fill('#eef1f4');
    doc.fillColor('#52606d').font('Helvetica-Bold').fontSize(9);
    doc.text('Description', COL.desc + 6, y + 6, { width: COL.descW - 12 });
    doc.text('Hours', COL.qty, y + 6, { width: COL.qtyW, align: 'right' });
    doc.text('Rate', COL.rate, y + 6, { width: COL.rateW, align: 'right' });
    doc.text('Amount', COL.amount, y + 6, { width: COL.amountW, align: 'right' });
    y += 24;
  };

  // Render one line item, wrapping the description and breaking pages as
  // needed. The description height drives the row height.
  const drawItemRow = (item, zebra) => {
    const description = String(item.description || '');
    const rowHeight = Math.max(
      20,
      doc.font('Helvetica').fontSize(10)
        .heightOfString(description, { width: COL.descW - 12 }) + 10
    );

    if (ensureSpace(rowHeight)) {
      drawItemsHeader();
    }

    if (zebra) {
      doc.rect(MARGIN, y, RIGHT - MARGIN, rowHeight).fill('#fafbfc');
    }

    doc.fillColor('#1f2933').font('Helvetica').fontSize(10);
    doc.text(description, COL.desc + 6, y + 5, { width: COL.descW - 12 });

    const numbersY = y + 5;
    doc.fillColor('#3e4c59');
    doc.text((parseFloat(item.quantity) || 0).toFixed(2), COL.qty, numbersY, { width: COL.qtyW, align: 'right' });
    doc.text(money(item.rate), COL.rate, numbersY, { width: COL.rateW, align: 'right' });
    doc.text(money(item.amount), COL.amount, numbersY, { width: COL.amountW, align: 'right' });

    y += rowHeight;
    doc.strokeColor('#eef1f4').lineWidth(0.5)
      .moveTo(MARGIN, y).lineTo(RIGHT, y).stroke();
  };

  // ---- Header ------------------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#2563eb').text('TimClock', MARGIN, y);
  doc.font('Helvetica').fontSize(9).fillColor('#7b8794')
    .text('Time tracking & billing', MARGIN, y + 30);

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1f2933')
    .text(`Invoice ${invoiceNumber}`, 300, y, { width: RIGHT - 300, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#52606d')
    .text(`Issued: ${issueDate || '-'}`, 300, y + 26, { width: RIGHT - 300, align: 'right' });
  if (dueDate) {
    doc.text(`Due: ${dueDate}`, 300, y + 39, { width: RIGHT - 300, align: 'right' });
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#3e4c59')
    .text(status.toUpperCase(), 300, y + (dueDate ? 52 : 39), { width: RIGHT - 300, align: 'right' });

  y += 80;
  doc.strokeColor('#e4e7eb').lineWidth(1.5).moveTo(MARGIN, y).lineTo(RIGHT, y).stroke();
  y += 20;

  // ---- Bill To / Project -------------------------------------------------
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#9aa5b1').text('BILL TO', MARGIN, y);
  let billY = y + 12;
  billTo.forEach((line, index) => {
    doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
      .fillColor(index === 0 ? '#1f2933' : '#3e4c59')
      .text(String(line), MARGIN, billY, { width: 250 });
    billY += 14;
  });

  if (invoice.project_name) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#9aa5b1')
      .text('PROJECT', 320, y, { width: RIGHT - 320 });
    doc.font('Helvetica').fontSize(10).fillColor('#1f2933')
      .text(String(invoice.project_name), 320, y + 12, { width: RIGHT - 320 });
  }

  y = Math.max(billY, y + 34) + 10;

  // ---- Line items --------------------------------------------------------
  drawItemsHeader();

  if (items.length > 0) {
    items.forEach((item, index) => drawItemRow(item, index % 2 === 1));
  } else {
    doc.fillColor('#9aa5b1').font('Helvetica').fontSize(10)
      .text('No line items', MARGIN, y, { width: RIGHT - MARGIN, align: 'center' });
    y += 24;
  }

  // ---- Totals ------------------------------------------------------------
  const totalsX = 340;
  const totalsW = RIGHT - totalsX;
  const totalsLine = (label, value, options = {}) => {
    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(options.size || 10)
      .fillColor(options.color || '#3e4c59');
    doc.text(label, totalsX, y, { width: totalsW / 2 });
    doc.text(value, totalsX + totalsW / 2, y, { width: totalsW / 2, align: 'right' });
    y += options.lineHeight || 16;
  };

  ensureSpace(100);
  y += 8;
  totalsLine('Subtotal', money(invoice.subtotal));

  if (discountAmount > 0) {
    totalsLine(
      discountType === 'percent' ? `Discount (${discountValue}%)` : 'Discount',
      `- ${money(discountAmount)}`
    );
  }

  if (taxAmount > 0) {
    totalsLine(`Tax (${taxRate.toFixed(2)}%)`, money(taxAmount));
  }

  doc.strokeColor('#e4e7eb').lineWidth(1.5).moveTo(totalsX, y).lineTo(RIGHT, y).stroke();
  y += 10;
  totalsLine('Total', money(invoice.total_amount), {
    bold: true, size: 14, color: '#1f2933', lineHeight: 20
  });

  // ---- Notes / Terms -----------------------------------------------------
  const drawNote = (heading, body) => {
    if (!body) return;
    ensureSpace(60);
    y += 14;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#52606d')
      .text(heading.toUpperCase(), MARGIN, y);
    y += 14;
    doc.font('Helvetica').fontSize(10).fillColor('#3e4c59')
      .text(String(body), MARGIN, y, { width: RIGHT - MARGIN });
    y = doc.y;
  };

  drawNote('Notes', invoice.notes);
  drawNote('Terms', invoice.terms);

  // ---- Footer ------------------------------------------------------------
  ensureSpace(40);
  y += 20;
  doc.font('Helvetica').fontSize(9).fillColor('#9aa5b1')
    .text('Thank you for your business.', MARGIN, y, { width: RIGHT - MARGIN, align: 'center' });

  doc.end();
});

/**
 * Send invoice via email
 * POST /api/billing/invoices/:id/send
 */
const sendInvoice = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  if (req.user.role === USER_ROLES.CONTRACTOR) {
    const owned = await executeQuery(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [invoiceId, req.user.id]
    );
    if (owned.length === 0) {
      throw new NotFoundError('Invoice not found');
    }
  }

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

  if (paymentAmount >= parseFloat(invoice.total_amount)) {
    // Fully paid: settle through the shared path, which records exactly one
    // payments row and applies the project PAID/payment_date side effect.
    await settleInvoice(invoiceId, payment_date, {
      amount: paymentAmount,
      paymentMethod: payment_method,
      notes,
      createdBy: req.user.id
    });
  } else {
    // Partial payment: record the ledger row only; the invoice is not settled.
    const insertPaymentQuery = `
      INSERT INTO payments (invoice_id, amount, payment_date, payment_method, notes, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;

    await executeQuery(insertPaymentQuery, [
      invoiceId, paymentAmount, payment_date, payment_method, notes
    ]);
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

  // Contractors may only read payments for invoices they created.
  if (req.user.role === USER_ROLES.CONTRACTOR) {
    const owned = await executeQuery(
      'SELECT id FROM invoices WHERE id = ? AND created_by = ?',
      [invoiceId, req.user.id]
    );
    if (owned.length === 0) {
      throw new NotFoundError('Invoice not found');
    }
  }

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

  // Return the updated rate
  const ratesQuery = `
    SELECT id, name, rate, currency, is_default, is_active, created_at, updated_at
    FROM billing_rates
    WHERE id = ?
  `;
  const rates = await executeQuery(ratesQuery, [rateId]);

  if (rates.length === 0) {
    throw new NotFoundError('Billing rate not found');
  }

  const updatedRate = rates[0];

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Billing rate updated successfully',
    data: {
      rate: {
        id: updatedRate.id,
        name: updatedRate.name,
        rate: parseFloat(updatedRate.rate),
        currency: updatedRate.currency,
        is_default: Boolean(updatedRate.is_default),
        is_active: Boolean(updatedRate.is_active),
        created_at: formatDate(updatedRate.created_at),
        updated_at: formatDate(updatedRate.updated_at)
      }
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

  // Contractors may only export their own invoices.
  if (req.user.role === USER_ROLES.CONTRACTOR) {
    whereConditions.push('i.created_by = ?');
    queryParams.push(req.user.id);
  }

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

/**
 * Mark an invoice as paid
 * POST /api/billing/invoices/:id/mark-paid
 *
 * Unlike recordPayment this does not require a payment body; it settles the
 * invoice for its full amount and records the corresponding payment row.
 */
const markInvoicePaid = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;
  const { paid_date, payment_method, notes } = req.body || {};

  let invoiceQuery = 'SELECT id, total_amount, status FROM invoices WHERE id = ?';
  const invoiceParams = [invoiceId];

  if (req.user.role === USER_ROLES.CONTRACTOR) {
    invoiceQuery += ' AND created_by = ?';
    invoiceParams.push(req.user.id);
  }

  const invoices = await executeQuery(invoiceQuery, invoiceParams);

  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const invoice = invoices[0];

  if (invoice.status === INVOICE_STATUS.PAID) {
    return res.json({
      status: API_RESPONSE.SUCCESS,
      message: SUCCESS_MESSAGES.INVOICE_PAID
    });
  }

  const effectivePaidDate = paid_date || new Date().toISOString().split('T')[0];

  await settleInvoice(invoiceId, effectivePaidDate, {
    amount: invoice.total_amount,
    paymentMethod: payment_method || 'manual',
    notes: notes || null,
    createdBy: req.user.id
  });

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.INVOICE_PAID
  });
});

/**
 * Mark invoice as sent without emailing it
 * POST /api/billing/invoices/:id/mark-sent
 */
const markInvoiceSent = asyncHandler(async (req, res) => {
  const invoiceId = req.params.id;

  let invoiceQuery = 'SELECT id, status FROM invoices WHERE id = ?';
  const invoiceParams = [invoiceId];

  if (req.user.role === USER_ROLES.CONTRACTOR) {
    invoiceQuery += ' AND created_by = ?';
    invoiceParams.push(req.user.id);
  }

  const invoices = await executeQuery(invoiceQuery, invoiceParams);

  if (invoices.length === 0) {
    throw new NotFoundError('Invoice not found');
  }

  const invoice = invoices[0];

  if (invoice.status === INVOICE_STATUS.PAID) {
    throw new ConflictError('Cannot mark a paid invoice as sent');
  }

  if (invoice.status === INVOICE_STATUS.SENT) {
    return res.json({
      status: API_RESPONSE.SUCCESS,
      message: 'Invoice already marked as sent'
    });
  }

  await executeQuery(
    'UPDATE invoices SET status = ?, updated_at = NOW() WHERE id = ?',
    [INVOICE_STATUS.SENT, invoiceId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Invoice marked as sent'
  });
});

/**
 * List projects that have unbilled time entries
 * GET /api/billing/billable-projects
 */
const getBillableProjects = asyncHandler(async (req, res) => {
  const { client_id } = req.query;
  const { page, limit, offset } = parsePagination(req.query);

  const whereConditions = ["p.status NOT IN ('paid', 'cancelled')"];
  const queryParams = [];

  if (client_id) {
    whereConditions.push('p.client_id = ?');
    queryParams.push(client_id);
  }

  if (req.user.role === USER_ROLES.CONTRACTOR) {
    whereConditions.push(employeeProjectAccess('p'));
    pushEmployeeProjectAccessParams(queryParams, req.user.id);
  }

  // Count the grouped projects (one row per project) for pagination metadata.
  const countQuery = `
    SELECT COUNT(*) as total
    FROM (
      SELECT p.id
      FROM projects p
      INNER JOIN clients c ON p.client_id = c.id
      INNER JOIN time_entries te ON te.project_id = p.id AND te.billable = 1 AND te.invoiced = 0
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY p.id
    ) as grouped_projects
  `;

  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  const projectsQuery = `
    SELECT p.id, p.name, p.status, p.client_id,
           c.name as client_name, c.company as client_company,
           COUNT(te.id) as unbilled_entries,
           COALESCE(SUM(te.duration_minutes), 0) as unbilled_minutes,
           COALESCE(SUM((te.duration_minutes / 60) * te.hourly_rate), 0) as unbilled_amount
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    INNER JOIN time_entries te ON te.project_id = p.id AND te.billable = 1 AND te.invoiced = 0
    WHERE ${whereConditions.join(' AND ')}
    GROUP BY p.id
    ORDER BY unbilled_amount DESC
    LIMIT ? OFFSET ?
  `;

  const projects = await executeQuery(projectsQuery, [...queryParams, limit, offset]);

  const paginated = buildPaginatedResponse(
    projects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      client: {
        id: project.client_id,
        name: project.client_name,
        company: project.client_company
      },
      unbilled_entries: project.unbilled_entries || 0,
      unbilled_hours: Math.round((project.unbilled_minutes || 0) / 60 * 100) / 100,
      unbilled_amount: parseFloat(project.unbilled_amount) || 0
    })),
    total,
    { page, limit }
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      projects: paginated.data,
      pagination: paginated.pagination
    }
  });
});

/**
 * Generate an invoice for a project's unbilled time entries
 * POST /api/billing/generate-invoice/:projectId
 */
const generateInvoiceFromProject = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;

  let projectsQuery = 'SELECT p.id, p.client_id FROM projects p WHERE p.id = ? AND p.is_active = 1';
  const projectParams = [projectId];

  // Employees and contractors may only invoice projects they can access.
  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    projectsQuery += ` AND ${employeeProjectAccess('p')}`;
    pushEmployeeProjectAccessParams(projectParams, req.user.id);
  }

  const projects = await executeQuery(projectsQuery, projectParams);

  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const project = projects[0];

  req.body = {
    ...req.body,
    client_id: req.body.client_id || project.client_id,
    project_id: projectId,
    issue_date: req.body.issue_date || new Date().toISOString().split('T')[0]
  };

  return createInvoice(req, res);
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
  getBillingSummary,
  markInvoicePaid,
  markInvoiceSent,
  getBillableProjects,
  generateInvoiceFromProject
};
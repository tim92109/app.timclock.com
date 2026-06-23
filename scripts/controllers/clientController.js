/**
 * Client Controller
 * Handles client management operations
 */

const { executeQuery } = require('../config/database');
const {
  NotFoundError,
  ConflictError,
  ValidationError,
  asyncHandler
} = require('../middleware/errorHandler');
const { 
  HTTP_STATUS, 
  SUCCESS_MESSAGES, 
  API_RESPONSE,
  USER_ROLES 
} = require('../utils/constants');
const { 
  parsePagination, 
  buildPaginatedResponse,
  formatDate,
  removeEmptyValues 
} = require('../utils/helpers');

/**
 * Get all clients with pagination and filtering
 * GET /api/clients
 */
const getClients = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { search, is_active } = req.query;

  // Build WHERE clause
  const whereConditions = [];
  const queryParams = [];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    // Employees can only see clients from their assigned projects
    whereConditions.push(`
      c.id IN (
        SELECT DISTINCT p.client_id 
        FROM projects p 
        WHERE p.assigned_to = ? AND p.is_active = 1
      )
    `);
    queryParams.push(req.user.id);
  }

  if (search) {
    whereConditions.push('(c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ?)');
    const searchTerm = `%${search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm);
  }

  if (is_active !== undefined) {
    whereConditions.push('c.is_active = ?');
    queryParams.push(is_active === 'true' ? 1 : 0);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM clients c
    ${whereClause}
  `;
  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  // Get clients with pagination
  const clientsQuery = `
    SELECT c.id, c.name, c.company, c.email, c.phone, c.address,
           c.hourly_rate, c.currency, c.billing_address, c.tax_id,
           c.payment_terms, c.is_active, c.notes, c.created_at, c.updated_at,
           COUNT(p.id) as project_count,
           SUM(CASE WHEN p.status IN ('active', 'complete') THEN 1 ELSE 0 END) as active_projects
    FROM clients c
    LEFT JOIN projects p ON c.id = p.client_id AND p.is_active = 1
    ${whereClause}
    GROUP BY c.id
    ORDER BY c.name ASC
    LIMIT ? OFFSET ?
  `;

  const clients = await executeQuery(clientsQuery, [...queryParams, limit, offset]);

  // Format response
  const formattedClients = clients.map(client => ({
    id: client.id,
    name: client.name,
    company: client.company,
    email: client.email,
    phone: client.phone,
    address: client.address,
    hourly_rate: parseFloat(client.hourly_rate),
    currency: client.currency,
    billing_address: client.billing_address,
    tax_id: client.tax_id,
    payment_terms: client.payment_terms,
    is_active: Boolean(client.is_active),
    notes: client.notes,
    project_count: client.project_count,
    active_projects: client.active_projects,
    created_at: formatDate(client.created_at),
    updated_at: formatDate(client.updated_at)
  }));

  const response = buildPaginatedResponse(formattedClients, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Get client by ID
 * GET /api/clients/:id
 */
const getClientById = asyncHandler(async (req, res) => {
  const clientId = req.params.id;

  let clientQuery = `
    SELECT c.id, c.name, c.company, c.email, c.phone, c.address,
           c.hourly_rate, c.currency, c.billing_address, c.tax_id,
           c.payment_terms, c.is_active, c.notes, c.created_at, c.updated_at,
           COUNT(p.id) as project_count,
           SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_projects,
           SUM(CASE WHEN p.status = 'complete' THEN 1 ELSE 0 END) as completed_projects
    FROM clients c
    LEFT JOIN projects p ON c.id = p.client_id AND p.is_active = 1
    WHERE c.id = ?
  `;

  const queryParams = [clientId];

  // Role-based access control
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    clientQuery += ` AND c.id IN (
      SELECT DISTINCT p2.client_id 
      FROM projects p2 
      WHERE p2.assigned_to = ? AND p2.is_active = 1
    )`;
    queryParams.push(req.user.id);
  }

  clientQuery += ' GROUP BY c.id';

  const clients = await executeQuery(clientQuery, queryParams);

  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  const client = clients[0];

  // Get recent projects for this client
  const projectsQuery = `
    SELECT id, name, status, start_date, due_date, estimated_hours, actual_hours
    FROM projects
    WHERE client_id = ? AND is_active = 1
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const recentProjects = await executeQuery(projectsQuery, [clientId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        address: client.address,
        hourly_rate: parseFloat(client.hourly_rate),
        currency: client.currency,
        billing_address: client.billing_address,
        tax_id: client.tax_id,
        payment_terms: client.payment_terms,
        is_active: Boolean(client.is_active),
        notes: client.notes,
        project_count: client.project_count,
        active_projects: client.active_projects,
        completed_projects: client.completed_projects,
        created_at: formatDate(client.created_at),
        updated_at: formatDate(client.updated_at)
      },
      recent_projects: recentProjects.map(project => ({
        id: project.id,
        name: project.name,
        status: project.status,
        start_date: formatDate(project.start_date),
        due_date: formatDate(project.due_date),
        estimated_hours: parseFloat(project.estimated_hours) || 0,
        actual_hours: parseFloat(project.actual_hours) || 0
      }))
    }
  });
});

/**
 * Create new client
 * POST /api/clients
 */
const createClient = asyncHandler(async (req, res) => {
  const {
    name,
    company,
    email,
    phone,
    address,
    hourly_rate,
    currency = 'USD',
    billing_address,
    tax_id,
    payment_terms = 30,
    notes
  } = req.body;

  // Check if client with same name and company already exists
  if (company) {
    const existingQuery = `
      SELECT id FROM clients 
      WHERE name = ? AND company = ? AND is_active = 1
    `;
    const existing = await executeQuery(existingQuery, [name, company]);
    
    if (existing.length > 0) {
      throw new ConflictError('Client with this name and company already exists');
    }
  }

  const insertQuery = `
    INSERT INTO clients (
      name, company, email, phone, address, hourly_rate, currency,
      billing_address, tax_id, payment_terms, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const result = await executeQuery(insertQuery, [
    name,
    company || null,
    email || null,
    phone || null,
    address || null,
    hourly_rate,
    currency,
    billing_address || null,
    tax_id || null,
    payment_terms,
    notes || null
  ]);

  // Get the created client
  const clientQuery = `
    SELECT id, name, company, email, phone, address, hourly_rate, currency,
           billing_address, tax_id, payment_terms, is_active, notes,
           created_at, updated_at
    FROM clients
    WHERE id = ?
  `;

  const clients = await executeQuery(clientQuery, [result.insertId]);
  const client = clients[0];

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.CLIENT_CREATED,
    data: {
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        address: client.address,
        hourly_rate: parseFloat(client.hourly_rate),
        currency: client.currency,
        billing_address: client.billing_address,
        tax_id: client.tax_id,
        payment_terms: client.payment_terms,
        is_active: Boolean(client.is_active),
        notes: client.notes,
        created_at: formatDate(client.created_at),
        updated_at: formatDate(client.updated_at)
      }
    }
  });
});

/**
 * Update client
 * PUT /api/clients/:id
 */
const updateClient = asyncHandler(async (req, res) => {
  const clientId = req.params.id;
  const updateData = removeEmptyValues(req.body);

  // Check if client exists
  const existingQuery = 'SELECT id FROM clients WHERE id = ?';
  const existing = await executeQuery(existingQuery, [clientId]);
  
  if (existing.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // Build update query dynamically
  const updateFields = [];
  const updateValues = [];

  const allowedFields = [
    'name', 'company', 'email', 'phone', 'address', 'hourly_rate',
    'currency', 'billing_address', 'tax_id', 'payment_terms', 'notes', 'is_active'
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
  updateValues.push(clientId);

  const updateQuery = `
    UPDATE clients 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `;

  await executeQuery(updateQuery, updateValues);

  // Get updated client
  const clientQuery = `
    SELECT id, name, company, email, phone, address, hourly_rate, currency,
           billing_address, tax_id, payment_terms, is_active, notes,
           created_at, updated_at
    FROM clients
    WHERE id = ?
  `;

  const clients = await executeQuery(clientQuery, [clientId]);
  const client = clients[0];

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.CLIENT_UPDATED,
    data: {
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email,
        phone: client.phone,
        address: client.address,
        hourly_rate: parseFloat(client.hourly_rate),
        currency: client.currency,
        billing_address: client.billing_address,
        tax_id: client.tax_id,
        payment_terms: client.payment_terms,
        is_active: Boolean(client.is_active),
        notes: client.notes,
        created_at: formatDate(client.created_at),
        updated_at: formatDate(client.updated_at)
      }
    }
  });
});

/**
 * Delete client (soft delete)
 * DELETE /api/clients/:id
 */
const deleteClient = asyncHandler(async (req, res) => {
  const clientId = req.params.id;

  // Check if client exists
  const existingQuery = 'SELECT id FROM clients WHERE id = ? AND is_active = 1';
  const existing = await executeQuery(existingQuery, [clientId]);
  
  if (existing.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // Check if client has active projects
  const projectsQuery = `
    SELECT COUNT(*) as count 
    FROM projects 
    WHERE client_id = ? AND status IN ('open', 'active') AND is_active = 1
  `;
  const projectsResult = await executeQuery(projectsQuery, [clientId]);
  
  if (projectsResult[0].count > 0) {
    throw new ConflictError('Cannot delete client with active projects');
  }

  // Soft delete client
  await executeQuery(
    'UPDATE clients SET is_active = 0, updated_at = NOW() WHERE id = ?',
    [clientId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.CLIENT_DELETED
  });
});

/**
 * Get client statistics
 * GET /api/clients/:id/stats
 */
const getClientStats = asyncHandler(async (req, res) => {
  const clientId = req.params.id;

  // Verify client exists and user has access
  const clientQuery = `
    SELECT id, name FROM clients WHERE id = ? AND is_active = 1
  `;
  const clients = await executeQuery(clientQuery, [clientId]);
  
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // Get project statistics
  const projectStatsQuery = `
    SELECT 
      COUNT(*) as total_projects,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_projects,
      SUM(estimated_hours) as total_estimated_hours,
      SUM(actual_hours) as total_actual_hours
    FROM projects
    WHERE client_id = ? AND is_active = 1
  `;

  const projectStats = await executeQuery(projectStatsQuery, [clientId]);

  // Get time tracking statistics
  const timeStatsQuery = `
    SELECT 
      COUNT(*) as total_time_entries,
      SUM(duration_minutes) as total_minutes,
      SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END) as billable_minutes
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE p.client_id = ?
  `;

  const timeStats = await executeQuery(timeStatsQuery, [clientId]);

  // Get invoice statistics
  const invoiceStatsQuery = `
    SELECT 
      COUNT(*) as total_invoices,
      SUM(total_amount) as total_invoiced,
      SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total_paid
    FROM invoices
    WHERE client_id = ?
  `;

  const invoiceStats = await executeQuery(invoiceStatsQuery, [clientId]);

  const stats = {
    projects: {
      total: projectStats[0].total_projects || 0,
      active: projectStats[0].active_projects || 0,
      completed: projectStats[0].completed_projects || 0,
      estimated_hours: parseFloat(projectStats[0].total_estimated_hours) || 0,
      actual_hours: parseFloat(projectStats[0].total_actual_hours) || 0
    },
    time_tracking: {
      total_entries: timeStats[0].total_time_entries || 0,
      total_hours: Math.round((timeStats[0].total_minutes || 0) / 60 * 100) / 100,
      billable_hours: Math.round((timeStats[0].billable_minutes || 0) / 60 * 100) / 100
    },
    billing: {
      total_invoices: invoiceStats[0].total_invoices || 0,
      total_invoiced: parseFloat(invoiceStats[0].total_invoiced) || 0,
      total_paid: parseFloat(invoiceStats[0].total_paid) || 0
    }
  };

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { stats }
  });
});

/**
 * Get all projects for a client
 * GET /api/clients/:id/projects
 */
const getClientProjects = asyncHandler(async (req, res) => {
  const clientId = req.params.id;
  const { page, limit, offset } = parsePagination(req.query);
  const { status, search } = req.query;

  // Verify client exists and user has access
  let clientQuery = 'SELECT id, name FROM clients WHERE id = ? AND is_active = 1';
  const clientParams = [clientId];

  // Role-based access control
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    clientQuery += ` AND id IN (
      SELECT DISTINCT p.client_id
      FROM projects p
      WHERE p.assigned_to = ? AND p.is_active = 1
    )`;
    clientParams.push(req.user.id);
  }

  const clients = await executeQuery(clientQuery, clientParams);
  
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // Build WHERE clause for projects
  const whereConditions = ['p.client_id = ?', 'p.is_active = 1'];
  const queryParams = [clientId];

  // Role-based filtering for employees
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('p.assigned_to = ?');
    queryParams.push(req.user.id);
  }

  if (status) {
    whereConditions.push('p.status = ?');
    queryParams.push(status);
  }

  if (search) {
    whereConditions.push('(p.name LIKE ? OR p.description LIKE ?)');
    const searchTerm = `%${search}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM projects p
    ${whereClause}
  `;
  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  // Get projects with pagination
  const projectsQuery = `
    SELECT p.id, p.name, p.description, p.status, p.priority,
           p.start_date, p.due_date, p.estimated_hours, p.actual_hours,
           p.hourly_rate, p.assigned_to, p.created_at, p.updated_at,
           u.first_name, u.last_name,
           COUNT(te.id) as time_entries_count,
           SUM(te.duration_minutes) as total_minutes
    FROM projects p
    LEFT JOIN users u ON p.assigned_to = u.id
    LEFT JOIN time_entries te ON p.id = te.project_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const projects = await executeQuery(projectsQuery, [...queryParams, limit, offset]);

  // Format response
  const formattedProjects = projects.map(project => ({
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    start_date: formatDate(project.start_date),
    due_date: formatDate(project.due_date),
    estimated_hours: parseFloat(project.estimated_hours) || 0,
    actual_hours: parseFloat(project.actual_hours) || 0,
    hourly_rate: parseFloat(project.hourly_rate) || 0,
    assigned_to: project.assigned_to ? {
      id: project.assigned_to,
      name: `${project.first_name} ${project.last_name}`.trim()
    } : null,
    time_entries_count: project.time_entries_count || 0,
    total_hours: Math.round((project.total_minutes || 0) / 60 * 100) / 100,
    created_at: formatDate(project.created_at),
    updated_at: formatDate(project.updated_at)
  }));

  const response = buildPaginatedResponse(formattedProjects, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      client: clients[0],
      ...response
    }
  });
});

/**
 * Get client time entries
 * GET /api/clients/:id/time
 */
const getClientTime = asyncHandler(async (req, res) => {
  const clientId = req.params.id;
  const { page, limit, offset } = parsePagination(req.query);

  // Verify client exists and user has access
  let clientQuery = 'SELECT id, name FROM clients WHERE id = ? AND is_active = 1';
  const clientParams = [clientId];

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    clientQuery += ` AND id IN (
      SELECT DISTINCT p.client_id
      FROM projects p
      WHERE p.assigned_to = ? AND p.is_active = 1
    )`;
    clientParams.push(req.user.id);
  }

  const clients = await executeQuery(clientQuery, clientParams);
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // Get time entries
  const timeQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time,
           te.duration_minutes, te.billable, te.created_at,
           p.name as project_name, u.first_name, u.last_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN users u ON te.user_id = u.id
    WHERE p.client_id = ?
    ORDER BY te.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const timeEntries = await executeQuery(timeQuery, [clientId, limit, offset]);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE p.client_id = ?
  `;
  const countResult = await executeQuery(countQuery, [clientId]);
  const total = countResult[0].total;

  const formattedEntries = timeEntries.map(entry => ({
    id: entry.id,
    description: entry.description,
    start_time: formatDate(entry.start_time),
    end_time: formatDate(entry.end_time),
    duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    billable: Boolean(entry.billable),
    project_name: entry.project_name,
    user_name: `${entry.first_name} ${entry.last_name}`,
    created_at: formatDate(entry.created_at)
  }));

  const response = buildPaginatedResponse(formattedEntries, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      client: clients[0],
      ...response
    }
  });
});

/**
 * Get client invoices
 * GET /api/clients/:id/invoices
 */
const getClientInvoices = asyncHandler(async (req, res) => {
  const clientId = req.params.id;
  const { page, limit, offset } = parsePagination(req.query);

  // Verify client exists and user has access
  let clientQuery = 'SELECT id, name FROM clients WHERE id = ? AND is_active = 1';
  const clientParams = [clientId];

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    clientQuery += ` AND id IN (
      SELECT DISTINCT p.client_id
      FROM projects p
      WHERE p.assigned_to = ? AND p.is_active = 1
    )`;
    clientParams.push(req.user.id);
  }

  const clients = await executeQuery(clientQuery, clientParams);
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  // Get invoices
  const invoicesQuery = `
    SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
           i.total_amount, i.paid_date, i.created_at,
           p.name as project_name
    FROM invoices i
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE i.client_id = ?
    ORDER BY i.issue_date DESC
    LIMIT ? OFFSET ?
  `;

  const invoices = await executeQuery(invoicesQuery, [clientId, limit, offset]);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM invoices
    WHERE client_id = ?
  `;
  const countResult = await executeQuery(countQuery, [clientId]);
  const total = countResult[0].total;

  const formattedInvoices = invoices.map(invoice => ({
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    issue_date: formatDate(invoice.issue_date),
    due_date: formatDate(invoice.due_date),
    total_amount: parseFloat(invoice.total_amount) || 0,
    paid_date: formatDate(invoice.paid_date),
    project_name: invoice.project_name,
    created_at: formatDate(invoice.created_at)
  }));

  const response = buildPaginatedResponse(formattedInvoices, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      client: clients[0],
      ...response
    }
  });
});

module.exports = {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientProjects,
  getClientStats,
  getClientTime,
  getClientInvoices
};
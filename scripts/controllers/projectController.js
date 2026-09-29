/**
 * Project Controller
 * Handles project management operations
 */

const { executeQuery, executeTransaction } = require('../config/database');
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
  USER_ROLES,
  PROJECT_STATUS,
  PROJECT_PRIORITY,
  TASK_STATUS
} = require('../utils/constants');
const { 
  parsePagination, 
  buildPaginatedResponse,
  formatDate,
  removeEmptyValues,
  employeeProjectAccess,
  pushEmployeeProjectAccessParams
} = require('../utils/helpers');

/**
 * Normalize a list of user ids into unique, positive integers.
 * @param {Array} userIds
 * @returns {number[]}
 */
const normalizeUserIds = (userIds) => {
  if (!Array.isArray(userIds)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of userIds) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
};

/**
 * Replace the assignment set for a project with the given user ids.
 * Empty input clears all assignments; duplicates are ignored.
 * @param {number|string} projectId
 * @param {Array} userIds
 * @returns {Promise<number[]>} The applied unique user ids
 */
const syncProjectAssignments = async (projectId, userIds) => {
  const uniqueIds = normalizeUserIds(userIds);

  await executeQuery('DELETE FROM project_assignments WHERE project_id = ?', [projectId]);

  if (uniqueIds.length === 0) {
    return uniqueIds;
  }

  const placeholders = uniqueIds.map(() => '(?, ?)').join(', ');
  const insertParams = [];
  for (const userId of uniqueIds) {
    insertParams.push(projectId, userId);
  }

  await executeQuery(
    `INSERT IGNORE INTO project_assignments (project_id, user_id) VALUES ${placeholders}`,
    insertParams
  );

  return uniqueIds;
};

/**
 * Fetch assignment rows for a set of projects in ONE query.
 * @param {Array<number>} projectIds
 * @returns {Promise<Map<number, Array<{id:number,name:string}>>>}
 */
const fetchAssignedUsersMap = async (projectIds) => {
  const map = new Map();
  if (!Array.isArray(projectIds) || projectIds.length === 0) {
    return map;
  }

  const placeholders = projectIds.map(() => '?').join(', ');
  const rows = await executeQuery(
    `SELECT pa.project_id, u.id, u.first_name, u.last_name
     FROM project_assignments pa
     JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id IN (${placeholders})`,
    projectIds
  );

  for (const row of rows) {
    if (!map.has(row.project_id)) {
      map.set(row.project_id, []);
    }
    map.get(row.project_id).push({
      id: row.id,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim()
    });
  }

  return map;
};

/**
 * Merge a project's assignment users with its lead assignee, deduped by id.
 * @param {Array<{id:number,name:string}>} assignments
 * @param {{id:number,name:string}|null} lead
 * @returns {Array<{id:number,name:string}>}
 */
const buildAssignedUsers = (assignments, lead) => {
  const list = Array.isArray(assignments) ? assignments.slice() : [];
  if (lead && !list.some((user) => user.id === lead.id)) {
    list.unshift({ id: lead.id, name: lead.name });
  }
  return list;
};

/**
 * Load a project the caller is allowed to act on.
 *
 * Admin and manager are unrestricted (the project must still exist). Employees
 * and contractors must satisfy {@link employeeProjectAccess}. Throws
 * NotFoundError when the project does not exist or is not accessible to the
 * caller, so resource ownership is never disclosed.
 *
 * @param {number|string} projectId
 * @param {Object} req - Express request (for req.user)
 * @param {string} columns - Project columns to select
 * @returns {Promise<Object>} The accessible project row
 */
const loadAccessibleProject = async (projectId, req, columns = 'p.id') => {
  let query = `SELECT ${columns} FROM projects p WHERE p.id = ? AND p.is_active = 1`;
  const params = [projectId];

  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    query += ` AND ${employeeProjectAccess('p')}`;
    pushEmployeeProjectAccessParams(params, req.user.id);
  }

  const rows = await executeQuery(query, params);

  if (rows.length === 0) {
    throw new NotFoundError('Project not found');
  }

  return rows[0];
};

/**
 * Get all projects with pagination and filtering
 * GET /api/projects
 */
const getProjects = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { search, status, client_id, assigned_to } = req.query;

  // Build WHERE clause
  const whereConditions = ['p.is_active = 1'];
  const queryParams = [];

  // Role-based filtering
  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    whereConditions.push(employeeProjectAccess('p'));
    pushEmployeeProjectAccessParams(queryParams, req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    whereConditions.push('(p.assigned_to = ? OR p.created_by = ?)');
    queryParams.push(req.user.id, req.user.id);
  }

  if (search) {
    whereConditions.push('(p.name LIKE ? OR p.description LIKE ?)');
    const searchTerm = `%${search}%`;
    queryParams.push(searchTerm, searchTerm);
  }

  if (status) {
    whereConditions.push('p.status = ?');
    queryParams.push(status);
  }

  if (client_id) {
    whereConditions.push('p.client_id = ?');
    queryParams.push(client_id);
  }

  if (assigned_to && req.user.role !== USER_ROLES.EMPLOYEE) {
    whereConditions.push('p.assigned_to = ?');
    queryParams.push(assigned_to);
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
           p.estimated_hours, p.actual_hours, p.hourly_rate, p.fixed_price,
           p.billing_type, p.start_date, p.due_date, p.completed_date,
           p.created_at, p.updated_at,
           c.id as client_id, c.name as client_name, c.company as client_company,
           u.id as assigned_user_id, u.first_name as assigned_first_name, 
           u.last_name as assigned_last_name,
           creator.first_name as creator_first_name, creator.last_name as creator_last_name,
           COUNT(DISTINCT te.id) as time_entries_count,
           SUM(te.duration_minutes) as total_minutes
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    LEFT JOIN users u ON p.assigned_to = u.id
    LEFT JOIN users creator ON p.created_by = creator.id
    LEFT JOIN time_entries te ON p.id = te.project_id
    ${whereClause}
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const projects = await executeQuery(projectsQuery, [...queryParams, limit, offset]);

  // Fetch all assignment users for this page in a single query (avoid N+1).
  const assignedUsersMap = await fetchAssignedUsersMap(projects.map((project) => project.id));

  // Format response
  const formattedProjects = projects.map(project => {
    const lead = project.assigned_user_id ? {
      id: project.assigned_user_id,
      name: `${project.assigned_first_name} ${project.assigned_last_name}`
    } : null;

    return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    estimated_hours: parseFloat(project.estimated_hours) || 0,
    actual_hours: parseFloat(project.actual_hours) || 0,
    hourly_rate: parseFloat(project.hourly_rate) || null,
    fixed_price: parseFloat(project.fixed_price) || null,
    billing_type: project.billing_type,
    start_date: formatDate(project.start_date),
    due_date: formatDate(project.due_date),
    completed_date: formatDate(project.completed_date),
    client: {
      id: project.client_id,
      name: project.client_name,
      company: project.client_company
    },
    assigned_user: lead,
    assigned_users: buildAssignedUsers(assignedUsersMap.get(project.id), lead),
    created_by: `${project.creator_first_name} ${project.creator_last_name}`,
    time_entries_count: project.time_entries_count || 0,
    total_hours: Math.round((project.total_minutes || 0) / 60 * 100) / 100,
    created_at: formatDate(project.created_at),
    updated_at: formatDate(project.updated_at)
    };
  });

  const response = buildPaginatedResponse(formattedProjects, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Get project by ID
 * GET /api/projects/:id
 */
const getProjectById = asyncHandler(async (req, res) => {
  const projectId = req.params.id;

  let projectQuery = `
    SELECT p.id, p.name, p.description, p.status, p.priority,
           p.estimated_hours, p.actual_hours, p.hourly_rate, p.fixed_price,
           p.billing_type, p.start_date, p.due_date, p.completed_date,
           p.invoice_date, p.payment_date, p.notes, p.created_at, p.updated_at,
           c.id as client_id, c.name as client_name, c.company as client_company,
           c.hourly_rate as client_hourly_rate,
           u.id as assigned_user_id, u.first_name as assigned_first_name, 
           u.last_name as assigned_last_name, u.email as assigned_email,
           creator.first_name as creator_first_name, creator.last_name as creator_last_name,
           pt.name as template_name
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    LEFT JOIN users u ON p.assigned_to = u.id
    LEFT JOIN users creator ON p.created_by = creator.id
    LEFT JOIN project_templates pt ON p.template_id = pt.id
    WHERE p.id = ? AND p.is_active = 1
  `;

  const queryParams = [projectId];

  // Role-based access control
  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    projectQuery += ` AND ${employeeProjectAccess('p')}`;
    pushEmployeeProjectAccessParams(queryParams, req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    projectQuery += ' AND (p.assigned_to = ? OR p.created_by = ?)';
    queryParams.push(req.user.id, req.user.id);
  }

  const projects = await executeQuery(projectQuery, queryParams);

  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const project = projects[0];

  // Get project tasks
  const tasksQuery = `
    SELECT id, name, description, status, priority, estimated_hours, 
           actual_hours, due_date, completed_date, created_at
    FROM tasks
    WHERE project_id = ?
    ORDER BY created_at DESC
  `;

  const tasks = await executeQuery(tasksQuery, [projectId]);

  // Get recent time entries
  const timeEntriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, 
           te.duration_minutes, te.billable, te.created_at,
           u.first_name, u.last_name
    FROM time_entries te
    INNER JOIN users u ON te.user_id = u.id
    WHERE te.project_id = ?
    ORDER BY te.start_time DESC
    LIMIT 10
  `;

  const timeEntries = await executeQuery(timeEntriesQuery, [projectId]);

  const assignedUsersMap = await fetchAssignedUsersMap([project.id]);
  const leadAssignee = project.assigned_user_id ? {
    id: project.assigned_user_id,
    name: `${project.assigned_first_name} ${project.assigned_last_name}`,
    email: project.assigned_email
  } : null;

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        estimated_hours: parseFloat(project.estimated_hours) || 0,
        actual_hours: parseFloat(project.actual_hours) || 0,
        hourly_rate: parseFloat(project.hourly_rate) || null,
        fixed_price: parseFloat(project.fixed_price) || null,
        billing_type: project.billing_type,
        start_date: formatDate(project.start_date),
        due_date: formatDate(project.due_date),
        completed_date: formatDate(project.completed_date),
        invoice_date: formatDate(project.invoice_date),
        payment_date: formatDate(project.payment_date),
        notes: project.notes,
        client: {
          id: project.client_id,
          name: project.client_name,
          company: project.client_company,
          hourly_rate: parseFloat(project.client_hourly_rate)
        },
        assigned_user: leadAssignee,
        assigned_users: buildAssignedUsers(assignedUsersMap.get(project.id), leadAssignee),
        created_by: `${project.creator_first_name} ${project.creator_last_name}`,
        template_name: project.template_name,
        created_at: formatDate(project.created_at),
        updated_at: formatDate(project.updated_at)
      },
      tasks: tasks.map(formatTask),
      recent_time_entries: timeEntries.map(entry => ({
        id: entry.id,
        description: entry.description,
        start_time: formatDate(entry.start_time),
        end_time: formatDate(entry.end_time),
        duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
        billable: Boolean(entry.billable),
        user_name: `${entry.first_name} ${entry.last_name}`,
        created_at: formatDate(entry.created_at)
      }))
    }
  });
});

/**
 * Create new project
 * POST /api/projects
 */
const createProject = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    client_id,
    template_id,
    estimated_hours,
    hourly_rate,
    fixed_price,
    billing_type = 'hourly',
    start_date,
    due_date,
    assigned_to,
    assigned_user_ids,
    priority = 'medium',
    notes
  } = req.body;

  const assignmentIds = normalizeUserIds(assigned_user_ids);

  // The lead stays in projects.assigned_to: explicit assigned_to wins, otherwise
  // the first of the provided assignment ids, otherwise none.
  const leadUserId = assigned_to || (assignmentIds.length > 0 ? assignmentIds[0] : null);

  // Verify client exists
  let clientQuery = 'SELECT id, hourly_rate FROM clients WHERE id = ? AND is_active = 1';
  const clientParams = [client_id];

  if (req.user.role === USER_ROLES.CONTRACTOR) {
    clientQuery += ' AND created_by = ?';
    clientParams.push(req.user.id);
  }

  const clients = await executeQuery(clientQuery, clientParams);
  
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  const client = clients[0];

  // Use client's hourly rate if not provided
  const projectHourlyRate = hourly_rate || client.hourly_rate;

  // Verify assigned user exists if provided
  if (assigned_to) {
    const userQuery = 'SELECT id FROM users WHERE id = ? AND is_active = 1';
    const users = await executeQuery(userQuery, [assigned_to]);
    
    if (users.length === 0) {
      throw new NotFoundError('Assigned user not found');
    }
  }

  const insertQuery = `
    INSERT INTO projects (
      name, description, client_id, template_id, estimated_hours,
      hourly_rate, fixed_price, billing_type, start_date, due_date,
      assigned_to, priority, notes, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const result = await executeQuery(insertQuery, [
    name,
    description || null,
    client_id,
    template_id || null,
    estimated_hours || null,
    projectHourlyRate || null,
    fixed_price || null,
    billing_type,
    start_date || null,
    due_date || null,
    leadUserId || null,
    priority,
    notes || null,
    req.user.id
  ]);

  // Project_assignments is the source of truth for the many-to-many set.
  if (assignmentIds.length > 0) {
    await syncProjectAssignments(result.insertId, assignmentIds);
  }

  // Get the created project
  const projectQuery = `
    SELECT p.id, p.name, p.description, p.status, p.priority,
           p.estimated_hours, p.hourly_rate, p.fixed_price, p.billing_type,
           p.start_date, p.due_date, p.notes, p.created_at, p.updated_at,
           c.name as client_name, c.company as client_company
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.id = ?
  `;

  const projects = await executeQuery(projectQuery, [result.insertId]);
  const project = projects[0];

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.PROJECT_CREATED,
    data: {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        estimated_hours: parseFloat(project.estimated_hours) || 0,
        hourly_rate: parseFloat(project.hourly_rate) || null,
        fixed_price: parseFloat(project.fixed_price) || null,
        billing_type: project.billing_type,
        start_date: formatDate(project.start_date),
        due_date: formatDate(project.due_date),
        notes: project.notes,
        client: {
          name: project.client_name,
          company: project.client_company
        },
        created_at: formatDate(project.created_at),
        updated_at: formatDate(project.updated_at)
      }
    }
  });
});

/**
 * Update project
 * PUT /api/projects/:id
 */
const updateProject = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const updateData = removeEmptyValues(req.body);

  // Check if project exists and user has access
  let existingQuery = `
    SELECT id, status, assigned_to, created_by 
    FROM projects 
    WHERE id = ? AND is_active = 1
  `;
  const queryParams = [projectId];

  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    existingQuery += ` AND ${employeeProjectAccess('projects')}`;
    pushEmployeeProjectAccessParams(queryParams, req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    existingQuery += ' AND (assigned_to = ? OR created_by = ?)';
    queryParams.push(req.user.id, req.user.id);
  }

  const existing = await executeQuery(existingQuery, queryParams);
  
  if (existing.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const currentProject = existing[0];

  // Handle status transitions
  if (updateData.status && updateData.status !== currentProject.status) {
    const validTransitions = {
      'open': ['active', 'cancelled'],
      'active': ['complete', 'cancelled'],
      'complete': ['invoice_sent'],
      'invoice_sent': ['paid'],
      'paid': [],
      'cancelled': ['open']
    };

    if (!validTransitions[currentProject.status].includes(updateData.status)) {
      throw new ValidationError(`Invalid status transition from ${currentProject.status} to ${updateData.status}`);
    }

    // Set completion date when marking as complete
    if (updateData.status === 'complete') {
      updateData.completed_date = new Date().toISOString().split('T')[0];
    }
  }

  // Replace the assignment set when the caller supplies assigned_user_ids
  // (an empty array intentionally clears it). projects.assigned_to keeps acting
  // as the lead: if the current lead is no longer in the set, move to the first
  // remaining id (or NULL).
  if (Array.isArray(updateData.assigned_user_ids)) {
    const appliedIds = await syncProjectAssignments(projectId, updateData.assigned_user_ids);

    if (updateData.assigned_to === undefined) {
      let leadUserId = currentProject.assigned_to;
      if (leadUserId === null || leadUserId === undefined || !appliedIds.includes(Number(leadUserId))) {
        leadUserId = appliedIds.length > 0 ? appliedIds[0] : null;
      }
      updateData.assigned_to = leadUserId;
    }
  }

  // Build update query dynamically
  const updateFields = [];
  const updateValues = [];

  const allowedFields = [
    'name', 'description', 'status', 'priority', 'estimated_hours',
    'hourly_rate', 'fixed_price', 'billing_type', 'start_date', 'due_date',
    'completed_date', 'assigned_to', 'notes'
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
  updateValues.push(projectId);

  const updateQuery = `
    UPDATE projects 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `;

  await executeQuery(updateQuery, updateValues);

  // Get updated project
  const projectQuery = `
    SELECT p.id, p.name, p.description, p.status, p.priority,
           p.estimated_hours, p.actual_hours, p.hourly_rate, p.fixed_price,
           p.billing_type, p.start_date, p.due_date, p.completed_date,
           p.notes, p.created_at, p.updated_at,
           c.name as client_name, c.company as client_company
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.id = ?
  `;

  const projects = await executeQuery(projectQuery, [projectId]);
  const project = projects[0];

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.PROJECT_UPDATED,
    data: {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        estimated_hours: parseFloat(project.estimated_hours) || 0,
        actual_hours: parseFloat(project.actual_hours) || 0,
        hourly_rate: parseFloat(project.hourly_rate) || null,
        fixed_price: parseFloat(project.fixed_price) || null,
        billing_type: project.billing_type,
        start_date: formatDate(project.start_date),
        due_date: formatDate(project.due_date),
        completed_date: formatDate(project.completed_date),
        notes: project.notes,
        client: {
          name: project.client_name,
          company: project.client_company
        },
        created_at: formatDate(project.created_at),
        updated_at: formatDate(project.updated_at)
      }
    }
  });
});

/**
 * Delete project (soft delete)
 * DELETE /api/projects/:id
 */
const deleteProject = asyncHandler(async (req, res) => {
  const projectId = req.params.id;

  // Check if project exists and user has permission
  let existingQuery = `
    SELECT id, status 
    FROM projects 
    WHERE id = ? AND is_active = 1
  `;
  const queryParams = [projectId];

  if (req.user.role !== USER_ROLES.ADMIN) {
    existingQuery += ' AND created_by = ?';
    queryParams.push(req.user.id);
  }

  const existing = await executeQuery(existingQuery, queryParams);
  
  if (existing.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const project = existing[0];

  // Check if project can be deleted
  if (['complete', 'invoice_sent', 'paid'].includes(project.status)) {
    throw new ConflictError('Cannot delete completed or invoiced projects');
  }

  // Check if project has time entries
  const timeEntriesQuery = `
    SELECT COUNT(*) as count 
    FROM time_entries 
    WHERE project_id = ?
  `;
  const timeEntriesResult = await executeQuery(timeEntriesQuery, [projectId]);
  
  if (timeEntriesResult[0].count > 0) {
    throw new ConflictError('Cannot delete project with time entries');
  }

  // Soft delete project
  await executeQuery(
    'UPDATE projects SET is_active = 0, updated_at = NOW() WHERE id = ?',
    [projectId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.PROJECT_DELETED
  });
});

/**
 * Get project templates
 * GET /api/projects/templates
 */
const getProjectTemplates = asyncHandler(async (req, res) => {
  const templatesQuery = `
    SELECT id, name, description, estimated_hours, default_hourly_rate, 
           created_at, updated_at
    FROM project_templates
    WHERE is_active = 1
    ORDER BY name ASC
  `;

  const templates = await executeQuery(templatesQuery);

  const formattedTemplates = templates.map(template => ({
    id: template.id,
    name: template.name,
    description: template.description,
    estimated_hours: parseFloat(template.estimated_hours) || 0,
    default_hourly_rate: parseFloat(template.default_hourly_rate) || null,
    created_at: formatDate(template.created_at),
    updated_at: formatDate(template.updated_at)
  }));

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { templates: formattedTemplates }
  });
});

/**
 * Assign user to project
 * POST /api/projects/:id/assign
 */
const assignUserToProject = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { user_id, role = 'assigned' } = req.body;

  // Verify project exists and user has permission
  const projectQuery = `
    SELECT id, name FROM projects
    WHERE id = ? AND is_active = 1
  `;
  const projects = await executeQuery(projectQuery, [projectId]);
  
  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Verify user exists
  const userQuery = `
    SELECT id, first_name, last_name FROM users
    WHERE id = ? AND is_active = 1
  `;
  const users = await executeQuery(userQuery, [user_id]);
  
  if (users.length === 0) {
    throw new NotFoundError('User not found');
  }

  // Record the many-to-many assignment (idempotent), then promote to lead only
  // when the project has no lead yet.
  await executeQuery(
    'INSERT IGNORE INTO project_assignments (project_id, user_id, role) VALUES (?, ?, ?)',
    [projectId, user_id, role]
  );

  await executeQuery(
    'UPDATE projects SET assigned_to = ?, updated_at = NOW() WHERE id = ? AND assigned_to IS NULL',
    [user_id, projectId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'User assigned to project successfully',
    data: {
      project_id: parseInt(projectId),
      user: {
        id: users[0].id,
        name: `${users[0].first_name} ${users[0].last_name}`
      }
    }
  });
});

/**
 * Remove user from project
 * DELETE /api/projects/:id/assign/:userId
 */
const removeUserFromProject = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const userId = req.params.userId;

  // Verify project exists
  const projectQuery = `
    SELECT id, assigned_to FROM projects
    WHERE id = ? AND is_active = 1
  `;
  const projects = await executeQuery(projectQuery, [projectId]);
  
  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Delete the assignment row (idempotent: absent row is fine).
  await executeQuery(
    'DELETE FROM project_assignments WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );

  // If the removed user was the lead, promote another remaining assignment or
  // clear the lead.
  if (String(projects[0].assigned_to) === String(userId)) {
    const remaining = await executeQuery(
      'SELECT user_id FROM project_assignments WHERE project_id = ? ORDER BY id ASC LIMIT 1',
      [projectId]
    );
    const nextLead = remaining.length > 0 ? remaining[0].user_id : null;

    await executeQuery(
      'UPDATE projects SET assigned_to = ?, updated_at = NOW() WHERE id = ?',
      [nextLead, projectId]
    );
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'User removed from project successfully'
  });
});

/**
 * Get project users
 * GET /api/projects/:id/users
 */
const getProjectUsers = asyncHandler(async (req, res) => {
  const projectId = req.params.id;

  // Verify project exists and user has access
  let projectQuery = `
    SELECT p.id, p.name, p.assigned_to
    FROM projects p
    WHERE p.id = ? AND p.is_active = 1
  `;
  const queryParams = [projectId];

  // Role-based access control
  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    projectQuery += ` AND ${employeeProjectAccess('p')}`;
    pushEmployeeProjectAccessParams(queryParams, req.user.id);
  }

  const projects = await executeQuery(projectQuery, queryParams);
  
  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const project = projects[0];

  // Distinct union of the lead assignee and every project_assignments user.
  const users = await executeQuery(
    `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
     FROM users u
     WHERE u.is_active = 1
       AND (u.id = ? OR u.id IN (
         SELECT pa.user_id FROM project_assignments pa WHERE pa.project_id = ?
       ))
     ORDER BY u.first_name ASC, u.last_name ASC`,
    [project.assigned_to, projectId]
  );

  const formattedUsers = users.map(user => ({
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    name: `${user.first_name || ''} ${user.last_name || ''}`.trim()
  }));

  const assignedUser = formattedUsers.find(user => user.id === project.assigned_to) || null;

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      project: {
        id: project.id,
        name: project.name
      },
      assigned_user: assignedUser,
      users: formattedUsers
    }
  });
});

/**
 * Get project time entries
 * GET /api/projects/:id/time-entries
 */
const getProjectTimeEntries = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { page, limit, offset } = parsePagination(req.query);

  // Verify project access
  let accessQuery = `
    SELECT id FROM projects
    WHERE id = ? AND is_active = 1
  `;
  const accessParams = [projectId];

  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    accessQuery += ` AND ${employeeProjectAccess('projects')}`;
    pushEmployeeProjectAccessParams(accessParams, req.user.id);
  }

  const projectAccess = await executeQuery(accessQuery, accessParams);
  
  if (projectAccess.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Get time entries
  const timeEntriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time,
           te.duration_minutes, te.billable, te.created_at,
           u.first_name, u.last_name
    FROM time_entries te
    INNER JOIN users u ON te.user_id = u.id
    WHERE te.project_id = ?
    ORDER BY te.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const timeEntries = await executeQuery(timeEntriesQuery, [projectId, limit, offset]);

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM time_entries
    WHERE project_id = ?
  `;
  const countResult = await executeQuery(countQuery, [projectId]);
  const total = countResult[0].total;

  const formattedEntries = timeEntries.map(entry => ({
    id: entry.id,
    description: entry.description,
    start_time: formatDate(entry.start_time),
    end_time: formatDate(entry.end_time),
    duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    billable: Boolean(entry.billable),
    user_name: `${entry.first_name} ${entry.last_name}`,
    created_at: formatDate(entry.created_at)
  }));

  const response = buildPaginatedResponse(formattedEntries, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Get project statistics
 * GET /api/projects/:id/stats
 */
const getProjectStats = asyncHandler(async (req, res) => {
  const projectId = req.params.id;

  // Verify project exists and user has access
  let projectQuery = `
    SELECT id, name, estimated_hours FROM projects
    WHERE id = ? AND is_active = 1
  `;
  const queryParams = [projectId];

  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    projectQuery += ` AND ${employeeProjectAccess('projects')}`;
    pushEmployeeProjectAccessParams(queryParams, req.user.id);
  }

  const projects = await executeQuery(projectQuery, queryParams);
  
  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  // Get time statistics
  const timeStatsQuery = `
    SELECT
      COUNT(*) as total_entries,
      SUM(duration_minutes) as total_minutes,
      SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END) as billable_minutes
    FROM time_entries
    WHERE project_id = ?
  `;

  const timeStats = await executeQuery(timeStatsQuery, [projectId]);

  const stats = {
    estimated_hours: parseFloat(projects[0].estimated_hours) || 0,
    total_entries: timeStats[0].total_entries || 0,
    total_hours: Math.round((timeStats[0].total_minutes || 0) / 60 * 100) / 100,
    billable_hours: Math.round((timeStats[0].billable_minutes || 0) / 60 * 100) / 100
  };

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { stats }
  });
});

/**
 * Update project status
 * POST /api/projects/:id/status
 */
const updateProjectStatus = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const { status } = req.body;

  if (!status) {
    throw new ValidationError('Status is required');
  }

  // Verify project exists and the caller has access
  const currentProject = await loadAccessibleProject(
    projectId,
    req,
    'p.id, p.status as current_status'
  );

  // Validate status transition
  const validStatuses = Object.values(PROJECT_STATUS);
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Update status
  const updateData = { status };
  if (status === 'complete') {
    updateData.completed_date = new Date().toISOString().split('T')[0];
  }

  const updateFields = Object.keys(updateData).map(key => `${key} = ?`);
  const updateValues = Object.values(updateData);
  updateValues.push(projectId);

  await executeQuery(
    `UPDATE projects SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
    updateValues
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Project status updated successfully',
    data: {
      project_id: parseInt(projectId),
      old_status: currentProject.current_status,
      new_status: status
    }
  });
});

/**
 * Create project from template
 * POST /api/projects/from-template
 */
const createProjectFromTemplate = asyncHandler(async (req, res) => {
  const { template_id, name, client_id, assigned_to } = req.body;

  if (!template_id || !name || !client_id) {
    throw new ValidationError('Template ID, name, and client ID are required');
  }

  // Verify template exists
  const templateQuery = `
    SELECT id, name as template_name, description, estimated_hours, default_hourly_rate
    FROM project_templates
    WHERE id = ? AND is_active = 1
  `;
  const templates = await executeQuery(templateQuery, [template_id]);
  
  if (templates.length === 0) {
    throw new NotFoundError('Template not found');
  }

  const template = templates[0];

  // Verify client exists
  let clientQuery = 'SELECT id, hourly_rate FROM clients WHERE id = ? AND is_active = 1';
  const clientParams = [client_id];

  if (req.user.role === USER_ROLES.CONTRACTOR) {
    clientQuery += ' AND created_by = ?';
    clientParams.push(req.user.id);
  }

  const clients = await executeQuery(clientQuery, clientParams);
  
  if (clients.length === 0) {
    throw new NotFoundError('Client not found');
  }

  const client = clients[0];

  // Create project from template
  const insertQuery = `
    INSERT INTO projects (
      name, description, client_id, template_id, estimated_hours,
      hourly_rate, assigned_to, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const result = await executeQuery(insertQuery, [
    name,
    template.description,
    client_id,
    template_id,
    template.estimated_hours,
    template.default_hourly_rate || client.hourly_rate,
    assigned_to || null,
    req.user.id
  ]);

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: 'Project created from template successfully',
    data: {
      project_id: result.insertId,
      template_name: template.template_name
    }
  });
});

/**
 * Get project tasks
 * GET /api/projects/:id/tasks
 */
const getProjectTasks = asyncHandler(async (req, res) => {
  const projectId = req.params.id;

  // Verify project access
  let accessQuery = `
    SELECT id FROM projects
    WHERE id = ? AND is_active = 1
  `;
  const accessParams = [projectId];

  if ([USER_ROLES.EMPLOYEE, USER_ROLES.CONTRACTOR].includes(req.user.role)) {
    accessQuery += ` AND ${employeeProjectAccess('projects')}`;
    pushEmployeeProjectAccessParams(accessParams, req.user.id);
  }

  const projectAccess = await executeQuery(accessQuery, accessParams);

  if (projectAccess.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const tasksQuery = `
    SELECT id, name, description, status, priority, estimated_hours,
           actual_hours, due_date, completed_date, created_at
    FROM tasks
    WHERE project_id = ?
    ORDER BY created_at DESC
  `;

  const tasks = await executeQuery(tasksQuery, [projectId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      tasks: tasks.map(formatTask)
    }
  });
});

const formatTask = (task) => ({
  id: task.id,
  name: task.name,
  title: task.name,
  description: task.description,
  status: task.status,
  priority: task.priority,
  estimated_hours: parseFloat(task.estimated_hours) || 0,
  actual_hours: parseFloat(task.actual_hours) || 0,
  assigned_to: task.assigned_to,
  due_date: formatDate(task.due_date),
  completed_date: formatDate(task.completed_date),
  completed: task.status === TASK_STATUS.COMPLETED,
  created_at: formatDate(task.created_at)
});

const TASK_SELECT = `
  SELECT id, name, description, status, priority, estimated_hours,
         actual_hours, assigned_to, due_date, completed_date, created_at
  FROM tasks
`;

/**
 * Create a task for a project
 * POST /api/projects/:id/tasks
 */
const createTask = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  const {
    name,
    title,
    description,
    status,
    priority,
    estimated_hours,
    assigned_to,
    due_date
  } = req.body;

  const taskName = name || title;

  if (!taskName) {
    throw new ValidationError('Task name is required');
  }

  // Verify project exists and the caller has access before touching the task
  await loadAccessibleProject(projectId, req);

  const result = await executeQuery(
    `INSERT INTO tasks (project_id, name, description, status, priority, estimated_hours, assigned_to, due_date, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      projectId,
      taskName,
      description || null,
      status || TASK_STATUS.PENDING,
      priority || PROJECT_PRIORITY.MEDIUM,
      estimated_hours || null,
      assigned_to || req.user.id,
      due_date || null,
      req.user.id
    ]
  );

  const tasks = await executeQuery(`${TASK_SELECT} WHERE id = ?`, [result.insertId]);

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: 'Task created successfully',
    data: { task: formatTask(tasks[0]) }
  });
});

/**
 * Update a task
 * PUT /api/projects/:id/tasks/:taskId
 *
 * Accepts either the API's native fields (name, status) or the UI's
 * convenience fields (title, completed).
 */
const updateTask = asyncHandler(async (req, res) => {
  const { id: projectId, taskId } = req.params;
  const {
    name,
    title,
    description,
    status,
    priority,
    estimated_hours,
    assigned_to,
    due_date,
    completed
  } = req.body;

  // Verify project access before touching the task
  await loadAccessibleProject(projectId, req);

  const existing = await executeQuery(
    'SELECT id, status FROM tasks WHERE id = ? AND project_id = ?',
    [taskId, projectId]
  );

  if (existing.length === 0) {
    throw new NotFoundError('Task not found');
  }

  const updateFields = [];
  const updateValues = [];

  const nextName = name || title;
  if (nextName !== undefined) {
    updateFields.push('name = ?');
    updateValues.push(nextName);
  }
  if (description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(description || null);
  }
  if (priority !== undefined) {
    updateFields.push('priority = ?');
    updateValues.push(priority);
  }
  if (estimated_hours !== undefined) {
    updateFields.push('estimated_hours = ?');
    updateValues.push(estimated_hours || null);
  }
  if (assigned_to !== undefined) {
    updateFields.push('assigned_to = ?');
    updateValues.push(assigned_to || null);
  }
  if (due_date !== undefined) {
    updateFields.push('due_date = ?');
    updateValues.push(due_date || null);
  }

  let nextStatus = status;
  if (nextStatus === undefined && completed !== undefined) {
    nextStatus = completed ? TASK_STATUS.COMPLETED : TASK_STATUS.PENDING;
  }
  if (nextStatus !== undefined) {
    updateFields.push('status = ?');
    updateValues.push(nextStatus);
    updateFields.push('completed_date = ?');
    updateValues.push(nextStatus === TASK_STATUS.COMPLETED ? new Date().toISOString().split('T')[0] : null);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  updateFields.push('updated_at = NOW()');
  updateValues.push(taskId, projectId);

  await executeQuery(
    `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ? AND project_id = ?`,
    updateValues
  );

  const tasks = await executeQuery(`${TASK_SELECT} WHERE id = ?`, [taskId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Task updated successfully',
    data: { task: formatTask(tasks[0]) }
  });
});

/**
 * Delete a task
 * DELETE /api/projects/:id/tasks/:taskId
 */
const deleteTask = asyncHandler(async (req, res) => {
  const { id: projectId, taskId } = req.params;

  // Verify project access before touching the task
  await loadAccessibleProject(projectId, req);

  const existing = await executeQuery(
    'SELECT id FROM tasks WHERE id = ? AND project_id = ?',
    [taskId, projectId]
  );

  if (existing.length === 0) {
    throw new NotFoundError('Task not found');
  }

  await executeQuery('DELETE FROM tasks WHERE id = ?', [taskId]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Task deleted successfully'
  });
});

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  assignUserToProject,
  removeUserFromProject,
  getProjectUsers,
  getProjectTimeEntries,
  getProjectStats,
  updateProjectStatus,
  getProjectTemplates,
  createProjectFromTemplate,
  getProjectTasks,
  createTask,
  updateTask,
  deleteTask
};
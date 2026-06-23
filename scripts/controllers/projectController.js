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
  PROJECT_PRIORITY 
} = require('../utils/constants');
const { 
  parsePagination, 
  buildPaginatedResponse,
  formatDate,
  removeEmptyValues 
} = require('../utils/helpers');

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
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('p.assigned_to = ?');
    queryParams.push(req.user.id);
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

  // Format response
  const formattedProjects = projects.map(project => ({
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
    assigned_user: project.assigned_user_id ? {
      id: project.assigned_user_id,
      name: `${project.assigned_first_name} ${project.assigned_last_name}`
    } : null,
    created_by: `${project.creator_first_name} ${project.creator_last_name}`,
    time_entries_count: project.time_entries_count || 0,
    total_hours: Math.round((project.total_minutes || 0) / 60 * 100) / 100,
    created_at: formatDate(project.created_at),
    updated_at: formatDate(project.updated_at)
  }));

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
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    projectQuery += ' AND p.assigned_to = ?';
    queryParams.push(req.user.id);
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
        assigned_user: project.assigned_user_id ? {
          id: project.assigned_user_id,
          name: `${project.assigned_first_name} ${project.assigned_last_name}`,
          email: project.assigned_email
        } : null,
        created_by: `${project.creator_first_name} ${project.creator_last_name}`,
        template_name: project.template_name,
        created_at: formatDate(project.created_at),
        updated_at: formatDate(project.updated_at)
      },
      tasks: tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description,
        status: task.status,
        priority: task.priority,
        estimated_hours: parseFloat(task.estimated_hours) || 0,
        actual_hours: parseFloat(task.actual_hours) || 0,
        due_date: formatDate(task.due_date),
        completed_date: formatDate(task.completed_date),
        created_at: formatDate(task.created_at)
      })),
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
    priority = 'medium',
    notes
  } = req.body;

  // Verify client exists
  const clientQuery = 'SELECT id, hourly_rate FROM clients WHERE id = ? AND is_active = 1';
  const clients = await executeQuery(clientQuery, [client_id]);
  
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
    assigned_to || null,
    priority,
    notes || null,
    req.user.id
  ]);

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

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    existingQuery += ' AND assigned_to = ?';
    queryParams.push(req.user.id);
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

  // Update project assignment
  await executeQuery(
    'UPDATE projects SET assigned_to = ?, updated_at = NOW() WHERE id = ?',
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

  if (projects[0].assigned_to != userId) {
    throw new ValidationError('User is not assigned to this project');
  }

  // Remove assignment
  await executeQuery(
    'UPDATE projects SET assigned_to = NULL, updated_at = NOW() WHERE id = ?',
    [projectId]
  );

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
    SELECT p.id, p.name, p.assigned_to,
           u.id as user_id, u.first_name, u.last_name, u.email
    FROM projects p
    LEFT JOIN users u ON p.assigned_to = u.id
    WHERE p.id = ? AND p.is_active = 1
  `;
  const queryParams = [projectId];

  // Role-based access control
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    projectQuery += ' AND p.assigned_to = ?';
    queryParams.push(req.user.id);
  }

  const projects = await executeQuery(projectQuery, queryParams);
  
  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const project = projects[0];
  const assignedUser = project.user_id ? {
    id: project.user_id,
    name: `${project.first_name} ${project.last_name}`,
    email: project.email
  } : null;

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      project: {
        id: project.id,
        name: project.name
      },
      assigned_user: assignedUser
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

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    accessQuery += ' AND assigned_to = ?';
    accessParams.push(req.user.id);
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

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    projectQuery += ' AND assigned_to = ?';
    queryParams.push(req.user.id);
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

  // Verify project exists
  const projectQuery = `
    SELECT id, status as current_status FROM projects
    WHERE id = ? AND is_active = 1
  `;
  const projects = await executeQuery(projectQuery, [projectId]);
  
  if (projects.length === 0) {
    throw new NotFoundError('Project not found');
  }

  const currentProject = projects[0];

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
  const clientQuery = 'SELECT id, hourly_rate FROM clients WHERE id = ? AND is_active = 1';
  const clients = await executeQuery(clientQuery, [client_id]);
  
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

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    accessQuery += ' AND assigned_to = ?';
    accessParams.push(req.user.id);
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
      tasks: tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description,
        status: task.status,
        priority: task.priority,
        estimated_hours: parseFloat(task.estimated_hours) || 0,
        actual_hours: parseFloat(task.actual_hours) || 0,
        due_date: formatDate(task.due_date),
        completed_date: formatDate(task.completed_date),
        created_at: formatDate(task.created_at)
      }))
    }
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
  getProjectTasks
};
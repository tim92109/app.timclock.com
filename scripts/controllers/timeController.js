/**
 * Time Tracking Controller
 * Handles time entry operations and clock in/out functionality
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
  ERROR_CODES 
} = require('../utils/constants');
const { 
  parsePagination, 
  buildPaginatedResponse,
  formatDate,
  calculateDuration,
  validateTimeRange,
  timeRangesOverlap,
  calculateBillableAmount 
} = require('../utils/helpers');

/**
 * Get current active time entry for user
 * GET /api/time/active
 */
const getActiveTimeEntry = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const activeQuery = `
    SELECT te.id, te.project_id, te.task_id, te.description, te.start_time,
           te.hourly_rate, te.billable, te.created_at,
           p.name as project_name, p.status as project_status,
           c.name as client_name, c.company as client_company,
           t.name as task_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON te.task_id = t.id
    WHERE te.user_id = ? AND te.end_time IS NULL
    ORDER BY te.start_time DESC
    LIMIT 1
  `;

  const activeEntries = await executeQuery(activeQuery, [userId]);

  if (activeEntries.length === 0) {
    return res.json({
      status: API_RESPONSE.SUCCESS,
      data: { active_entry: null }
    });
  }

  const entry = activeEntries[0];
  const currentDuration = calculateDuration(entry.start_time, new Date());

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      active_entry: {
        id: entry.id,
        project_id: entry.project_id,
        project_name: entry.project_name,
        project_status: entry.project_status,
        client_name: entry.client_name,
        client_company: entry.client_company,
        task_id: entry.task_id,
        task_name: entry.task_name,
        description: entry.description,
        start_time: formatDate(entry.start_time),
        current_duration_minutes: currentDuration,
        hourly_rate: parseFloat(entry.hourly_rate) || 0,
        billable: Boolean(entry.billable),
        created_at: formatDate(entry.created_at)
      }
    }
  });
});

/**
 * Clock in - Start new time entry
 * POST /api/time/clock-in
 */
const clockIn = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { project_id, task_id, description } = req.body;

  // Check if user already has an active time entry
  const activeQuery = `
    SELECT id FROM time_entries 
    WHERE user_id = ? AND end_time IS NULL
  `;
  const activeEntries = await executeQuery(activeQuery, [userId]);

  if (activeEntries.length > 0) {
    throw new ConflictError('You are already clocked in. Please clock out first.');
  }

  // Verify project exists and user has access
  let projectQuery = `
    SELECT p.id, p.name, p.status, p.hourly_rate, c.hourly_rate as client_hourly_rate
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.id = ? AND p.is_active = 1
  `;
  const projectParams = [project_id];

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    projectQuery += ' AND p.assigned_to = ?';
    projectParams.push(userId);
  }

  const projects = await executeQuery(projectQuery, projectParams);

  if (projects.length === 0) {
    throw new NotFoundError('Project');
  }

  const project = projects[0];

  if (project.status === 'complete' || project.status === 'cancelled') {
    throw new ConflictError('Cannot clock in to completed or cancelled project');
  }

  // Verify task exists if provided
  if (task_id) {
    const taskQuery = `
      SELECT id FROM tasks 
      WHERE id = ? AND project_id = ? AND status != 'cancelled'
    `;
    const tasks = await executeQuery(taskQuery, [task_id, project_id]);

    if (tasks.length === 0) {
      throw new NotFoundError('Task');
    }
  }

  // Determine hourly rate
  const hourlyRate = project.hourly_rate || project.client_hourly_rate || req.user.hourly_rate;

  // Create new time entry
  const insertQuery = `
    INSERT INTO time_entries (
      user_id, project_id, task_id, description, start_time,
      hourly_rate, billable, created_at, updated_at
    ) VALUES (?, ?, ?, ?, NOW(), ?, 1, NOW(), NOW())
  `;

  const result = await executeQuery(insertQuery, [
    userId,
    project_id,
    task_id || null,
    description || null,
    hourlyRate || null
  ]);

  // Get the created time entry
  const entryQuery = `
    SELECT te.id, te.project_id, te.task_id, te.description, te.start_time,
           te.hourly_rate, te.billable, te.created_at,
           p.name as project_name, c.name as client_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE te.id = ?
  `;

  const entries = await executeQuery(entryQuery, [result.insertId]);
  const entry = entries[0];

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.CLOCK_IN_SUCCESS,
    data: {
      time_entry: {
        id: entry.id,
        project_id: entry.project_id,
        project_name: entry.project_name,
        client_name: entry.client_name,
        task_id: entry.task_id,
        description: entry.description,
        start_time: formatDate(entry.start_time),
        hourly_rate: parseFloat(entry.hourly_rate) || 0,
        billable: Boolean(entry.billable),
        created_at: formatDate(entry.created_at)
      }
    }
  });
});

/**
 * Clock out - End active time entry
 * POST /api/time/clock-out
 */
const clockOut = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { description } = req.body;

  // Find active time entry
  const activeQuery = `
    SELECT te.id, te.start_time, te.description, te.hourly_rate,
           p.name as project_name, c.name as client_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NULL
    ORDER BY te.start_time DESC
    LIMIT 1
  `;

  const activeEntries = await executeQuery(activeQuery, [userId]);

  if (activeEntries.length === 0) {
    throw new ConflictError('No active time entry found');
  }

  const activeEntry = activeEntries[0];
  const endTime = new Date();
  const duration = calculateDuration(activeEntry.start_time, endTime);

  // Update time entry
  const updateQuery = `
    UPDATE time_entries 
    SET end_time = ?, duration_minutes = ?, description = COALESCE(?, description), updated_at = NOW()
    WHERE id = ?
  `;

  await executeQuery(updateQuery, [
    endTime,
    duration,
    description,
    activeEntry.id
  ]);

  // Update project actual hours
  await executeQuery(`
    UPDATE projects 
    SET actual_hours = (
      SELECT COALESCE(SUM(duration_minutes), 0) / 60 
      FROM time_entries 
      WHERE project_id = (SELECT project_id FROM time_entries WHERE id = ?)
    ),
    updated_at = NOW()
    WHERE id = (SELECT project_id FROM time_entries WHERE id = ?)
  `, [activeEntry.id, activeEntry.id]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.CLOCK_OUT_SUCCESS,
    data: {
      time_entry: {
        id: activeEntry.id,
        project_name: activeEntry.project_name,
        client_name: activeEntry.client_name,
        start_time: formatDate(activeEntry.start_time),
        end_time: formatDate(endTime),
        duration_minutes: duration,
        duration_hours: Math.round(duration / 60 * 100) / 100,
        description: description || activeEntry.description,
        hourly_rate: parseFloat(activeEntry.hourly_rate) || 0,
        billable_amount: calculateBillableAmount(duration, activeEntry.hourly_rate)
      }
    }
  });
});

/**
 * Get time entries with pagination and filtering
 * GET /api/time/entries
 */
const getTimeEntries = asyncHandler(async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const { 
    start_date, 
    end_date, 
    project_id, 
    client_id, 
    user_id, 
    billable 
  } = req.query;

  // Build WHERE clause
  const whereConditions = [];
  const queryParams = [];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(req.user.id);
  } else if (user_id && req.user.role !== USER_ROLES.ADMIN) {
    // Managers can view entries for users in their projects
    whereConditions.push(`
      te.user_id = ? AND te.project_id IN (
        SELECT id FROM projects 
        WHERE assigned_to = ? OR created_by = ?
      )
    `);
    queryParams.push(user_id, req.user.id, req.user.id);
  } else if (user_id) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(user_id);
  }

  if (start_date) {
    whereConditions.push('DATE(te.start_time) >= ?');
    queryParams.push(start_date);
  }

  if (end_date) {
    whereConditions.push('DATE(te.start_time) <= ?');
    queryParams.push(end_date);
  }

  if (project_id) {
    whereConditions.push('te.project_id = ?');
    queryParams.push(project_id);
  }

  if (client_id) {
    whereConditions.push('p.client_id = ?');
    queryParams.push(client_id);
  }

  if (billable !== undefined) {
    whereConditions.push('te.billable = ?');
    queryParams.push(billable === 'true' ? 1 : 0);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    ${whereClause}
  `;
  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  // Get time entries with pagination
  const entriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.invoiced, te.is_manual, te.created_at,
           p.id as project_id, p.name as project_name, p.status as project_status,
           c.id as client_id, c.name as client_name, c.company as client_company,
           u.id as user_id, u.first_name, u.last_name,
           t.name as task_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    INNER JOIN users u ON te.user_id = u.id
    LEFT JOIN tasks t ON te.task_id = t.id
    ${whereClause}
    ORDER BY te.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const entries = await executeQuery(entriesQuery, [...queryParams, limit, offset]);

  // Format response
  const formattedEntries = entries.map(entry => ({
    id: entry.id,
    description: entry.description,
    start_time: formatDate(entry.start_time),
    end_time: formatDate(entry.end_time),
    duration_minutes: entry.duration_minutes || 0,
    duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    hourly_rate: parseFloat(entry.hourly_rate) || 0,
    billable_amount: calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
    billable: Boolean(entry.billable),
    invoiced: Boolean(entry.invoiced),
    is_manual: Boolean(entry.is_manual),
    project: {
      id: entry.project_id,
      name: entry.project_name,
      status: entry.project_status
    },
    client: {
      id: entry.client_id,
      name: entry.client_name,
      company: entry.client_company
    },
    user: {
      id: entry.user_id,
      name: `${entry.first_name} ${entry.last_name}`
    },
    task_name: entry.task_name,
    created_at: formatDate(entry.created_at)
  }));

  const response = buildPaginatedResponse(formattedEntries, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Create manual time entry
 * POST /api/time/entries
 */
const createTimeEntry = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const {
    project_id,
    task_id,
    description,
    start_time,
    end_time,
    hourly_rate,
    billable = true
  } = req.body;

  // Validate time range
  const timeValidation = validateTimeRange(start_time, end_time);
  if (!timeValidation.isValid) {
    throw new ValidationError(timeValidation.error);
  }

  // Verify project access
  let projectQuery = `
    SELECT p.id, p.name, p.status, p.hourly_rate, c.hourly_rate as client_hourly_rate
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.id = ? AND p.is_active = 1
  `;
  const projectParams = [project_id];

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    projectQuery += ' AND p.assigned_to = ?';
    projectParams.push(userId);
  }

  const projects = await executeQuery(projectQuery, projectParams);

  if (projects.length === 0) {
    throw new NotFoundError('Project');
  }

  const project = projects[0];

  // Check for overlapping time entries
  const overlapQuery = `
    SELECT id FROM time_entries
    WHERE user_id = ? AND (
      (start_time <= ? AND end_time > ?) OR
      (start_time < ? AND end_time >= ?) OR
      (start_time >= ? AND end_time <= ?)
    )
  `;

  const overlapping = await executeQuery(overlapQuery, [
    userId, start_time, start_time, end_time, end_time, start_time, end_time
  ]);

  if (overlapping.length > 0) {
    throw new ConflictError('Time entry overlaps with existing entry');
  }

  // Determine hourly rate
  const entryHourlyRate = hourly_rate || project.hourly_rate || project.client_hourly_rate || req.user.hourly_rate;
  const duration = timeValidation.duration;

  // Create time entry
  const insertQuery = `
    INSERT INTO time_entries (
      user_id, project_id, task_id, description, start_time, end_time,
      duration_minutes, hourly_rate, billable, is_manual, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
  `;

  const result = await executeQuery(insertQuery, [
    userId,
    project_id,
    task_id || null,
    description || null,
    start_time,
    end_time,
    duration,
    entryHourlyRate || null,
    billable ? 1 : 0
  ]);

  // Update project actual hours
  await executeQuery(`
    UPDATE projects 
    SET actual_hours = (
      SELECT COALESCE(SUM(duration_minutes), 0) / 60 
      FROM time_entries 
      WHERE project_id = ?
    ),
    updated_at = NOW()
    WHERE id = ?
  `, [project_id, project_id]);

  // Get created entry
  const entryQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.is_manual, te.created_at,
           p.name as project_name, c.name as client_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE te.id = ?
  `;

  const entries = await executeQuery(entryQuery, [result.insertId]);
  const entry = entries[0];

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.TIME_ENTRY_CREATED,
    data: {
      time_entry: {
        id: entry.id,
        description: entry.description,
        start_time: formatDate(entry.start_time),
        end_time: formatDate(entry.end_time),
        duration_minutes: entry.duration_minutes,
        duration_hours: Math.round(entry.duration_minutes / 60 * 100) / 100,
        hourly_rate: parseFloat(entry.hourly_rate) || 0,
        billable_amount: calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
        billable: Boolean(entry.billable),
        is_manual: Boolean(entry.is_manual),
        project_name: entry.project_name,
        client_name: entry.client_name,
        created_at: formatDate(entry.created_at)
      }
    }
  });
});

/**
 * Update time entry
 * PUT /api/time/entries/:id
 */
const updateTimeEntry = asyncHandler(async (req, res) => {
  const entryId = req.params.id;
  const {
    description,
    start_time,
    end_time,
    billable
  } = req.body;

  // Check if entry exists and user has access
  let entryQuery = `
    SELECT te.id, te.user_id, te.start_time, te.end_time, te.invoiced,
           te.project_id, p.assigned_to, p.created_by
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE te.id = ?
  `;
  const queryParams = [entryId];

  const entries = await executeQuery(entryQuery, queryParams);

  if (entries.length === 0) {
    throw new NotFoundError('Time entry');
  }

  const entry = entries[0];

  // Check permissions
  if (req.user.role === USER_ROLES.EMPLOYEE && entry.user_id !== req.user.id) {
    throw new AuthorizationError('Access denied');
  } else if (req.user.role === USER_ROLES.MANAGER) {
    if (entry.user_id !== req.user.id && 
        entry.assigned_to !== req.user.id && 
        entry.created_by !== req.user.id) {
      throw new AuthorizationError('Access denied');
    }
  }

  // Cannot edit invoiced entries
  if (entry.invoiced) {
    throw new ConflictError('Cannot edit invoiced time entry');
  }

  // Build update query
  const updateFields = [];
  const updateValues = [];

  if (description !== undefined) {
    updateFields.push('description = ?');
    updateValues.push(description);
  }

  if (start_time && end_time) {
    const timeValidation = validateTimeRange(start_time, end_time);
    if (!timeValidation.isValid) {
      throw new ValidationError(timeValidation.error);
    }

    updateFields.push('start_time = ?', 'end_time = ?', 'duration_minutes = ?');
    updateValues.push(start_time, end_time, timeValidation.duration);
  }

  if (billable !== undefined) {
    updateFields.push('billable = ?');
    updateValues.push(billable ? 1 : 0);
  }

  if (updateFields.length === 0) {
    throw new ValidationError('No fields to update');
  }

  updateFields.push('updated_at = NOW()');
  updateValues.push(entryId);

  const updateQuery = `
    UPDATE time_entries 
    SET ${updateFields.join(', ')} 
    WHERE id = ?
  `;

  await executeQuery(updateQuery, updateValues);

  // Update project actual hours if duration changed
  if (start_time && end_time) {
    await executeQuery(`
      UPDATE projects 
      SET actual_hours = (
        SELECT COALESCE(SUM(duration_minutes), 0) / 60 
        FROM time_entries 
        WHERE project_id = ?
      ),
      updated_at = NOW()
      WHERE id = ?
    `, [entry.project_id, entry.project_id]);
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.TIME_ENTRY_UPDATED
  });
});

/**
 * Delete time entry
 * DELETE /api/time/entries/:id
 */
const deleteTimeEntry = asyncHandler(async (req, res) => {
  const entryId = req.params.id;

  // Check if entry exists and user has access
  const entryQuery = `
    SELECT te.id, te.user_id, te.invoiced, te.project_id,
           p.assigned_to, p.created_by
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE te.id = ?
  `;

  const entries = await executeQuery(entryQuery, [entryId]);

  if (entries.length === 0) {
    throw new NotFoundError('Time entry');
  }

  const entry = entries[0];

  // Check permissions
  if (req.user.role === USER_ROLES.EMPLOYEE && entry.user_id !== req.user.id) {
    throw new AuthorizationError('Access denied');
  } else if (req.user.role === USER_ROLES.MANAGER) {
    if (entry.user_id !== req.user.id && 
        entry.assigned_to !== req.user.id && 
        entry.created_by !== req.user.id) {
      throw new AuthorizationError('Access denied');
    }
  }

  // Cannot delete invoiced entries
  if (entry.invoiced) {
    throw new ConflictError('Cannot delete invoiced time entry');
  }

  // Delete entry
  await executeQuery('DELETE FROM time_entries WHERE id = ?', [entryId]);

  // Update project actual hours
  await executeQuery(`
    UPDATE projects 
    SET actual_hours = (
      SELECT COALESCE(SUM(duration_minutes), 0) / 60 
      FROM time_entries 
      WHERE project_id = ?
    ),
    updated_at = NOW()
    WHERE id = ?
  `, [entry.project_id, entry.project_id]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: SUCCESS_MESSAGES.TIME_ENTRY_DELETED
  });
});

/**
 * Get time entry by ID
 * GET /api/time-entries/:id
 */
const getTimeEntryById = asyncHandler(async (req, res) => {
  const entryId = req.params.id;
  
  let entryQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.invoiced, te.is_manual, te.created_at,
           p.id as project_id, p.name as project_name, p.status as project_status,
           c.id as client_id, c.name as client_name, c.company as client_company,
           u.id as user_id, u.first_name, u.last_name,
           t.name as task_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    INNER JOIN users u ON te.user_id = u.id
    LEFT JOIN tasks t ON te.task_id = t.id
    WHERE te.id = ?
  `;
  const queryParams = [entryId];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    entryQuery += ' AND te.user_id = ?';
    queryParams.push(req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    entryQuery += ' AND (te.user_id = ? OR p.assigned_to = ? OR p.created_by = ?)';
    queryParams.push(req.user.id, req.user.id, req.user.id);
  }

  const entries = await executeQuery(entryQuery, queryParams);

  if (entries.length === 0) {
    throw new NotFoundError('Time entry');
  }

  const entry = entries[0];

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      time_entry: {
        id: entry.id,
        description: entry.description,
        start_time: formatDate(entry.start_time),
        end_time: formatDate(entry.end_time),
        duration_minutes: entry.duration_minutes || 0,
        duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
        hourly_rate: parseFloat(entry.hourly_rate) || 0,
        billable_amount: calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
        billable: Boolean(entry.billable),
        invoiced: Boolean(entry.invoiced),
        is_manual: Boolean(entry.is_manual),
        project: {
          id: entry.project_id,
          name: entry.project_name,
          status: entry.project_status
        },
        client: {
          id: entry.client_id,
          name: entry.client_name,
          company: entry.client_company
        },
        user: {
          id: entry.user_id,
          name: `${entry.first_name} ${entry.last_name}`
        },
        task_name: entry.task_name,
        created_at: formatDate(entry.created_at)
      }
    }
  });
});

/**
 * Get current active time entry for user
 * GET /api/time-entries/current
 */
const getCurrentTimeEntry = asyncHandler(async (req, res) => {
  return getActiveTimeEntry(req, res);
});

/**
 * Get time entries for specific user
 * GET /api/time-entries/user/:userId
 */
const getUserTimeEntries = asyncHandler(async (req, res) => {
  const targetUserId = req.params.userId;
  const { page, limit, offset } = parsePagination(req.query);

  // Check permissions
  if (req.user.role === USER_ROLES.EMPLOYEE && targetUserId != req.user.id) {
    throw new AuthorizationError('Access denied');
  }

  const whereConditions = ['te.user_id = ?'];
  const queryParams = [targetUserId];

  // Manager can only see entries for users in their projects
  if (req.user.role === USER_ROLES.MANAGER && targetUserId != req.user.id) {
    whereConditions.push(`te.project_id IN (
      SELECT id FROM projects
      WHERE assigned_to = ? OR created_by = ?
    )`);
    queryParams.push(req.user.id, req.user.id);
  }

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM time_entries te
    ${whereClause}
  `;
  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  // Get entries
  const entriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.invoiced, te.is_manual, te.created_at,
           p.id as project_id, p.name as project_name,
           c.name as client_name, t.name as task_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    LEFT JOIN tasks t ON te.task_id = t.id
    ${whereClause}
    ORDER BY te.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const entries = await executeQuery(entriesQuery, [...queryParams, limit, offset]);

  const formattedEntries = entries.map(entry => ({
    id: entry.id,
    description: entry.description,
    start_time: formatDate(entry.start_time),
    end_time: formatDate(entry.end_time),
    duration_minutes: entry.duration_minutes || 0,
    duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    hourly_rate: parseFloat(entry.hourly_rate) || 0,
    billable_amount: calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
    billable: Boolean(entry.billable),
    invoiced: Boolean(entry.invoiced),
    is_manual: Boolean(entry.is_manual),
    project_name: entry.project_name,
    client_name: entry.client_name,
    task_name: entry.task_name,
    created_at: formatDate(entry.created_at)
  }));

  const response = buildPaginatedResponse(formattedEntries, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Get time entries for specific project
 * GET /api/time-entries/project/:projectId
 */
const getProjectTimeEntries = asyncHandler(async (req, res) => {
  const projectId = req.params.projectId;
  const { page, limit, offset } = parsePagination(req.query);

  // Check project access
  let projectQuery = `
    SELECT id FROM projects WHERE id = ?
  `;
  const projectParams = [projectId];

  if (req.user.role === USER_ROLES.EMPLOYEE) {
    projectQuery += ' AND assigned_to = ?';
    projectParams.push(req.user.id);
  } else if (req.user.role === USER_ROLES.MANAGER) {
    projectQuery += ' AND (assigned_to = ? OR created_by = ?)';
    projectParams.push(req.user.id, req.user.id);
  }

  const projects = await executeQuery(projectQuery, projectParams);

  if (projects.length === 0) {
    throw new NotFoundError('Project');
  }

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM time_entries te
    WHERE te.project_id = ?
  `;
  const countResult = await executeQuery(countQuery, [projectId]);
  const total = countResult[0].total;

  // Get entries
  const entriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.invoiced, te.is_manual, te.created_at,
           u.first_name, u.last_name, t.name as task_name
    FROM time_entries te
    INNER JOIN users u ON te.user_id = u.id
    LEFT JOIN tasks t ON te.task_id = t.id
    WHERE te.project_id = ?
    ORDER BY te.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const entries = await executeQuery(entriesQuery, [projectId, limit, offset]);

  const formattedEntries = entries.map(entry => ({
    id: entry.id,
    description: entry.description,
    start_time: formatDate(entry.start_time),
    end_time: formatDate(entry.end_time),
    duration_minutes: entry.duration_minutes || 0,
    duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    hourly_rate: parseFloat(entry.hourly_rate) || 0,
    billable_amount: calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
    billable: Boolean(entry.billable),
    invoiced: Boolean(entry.invoiced),
    is_manual: Boolean(entry.is_manual),
    user_name: `${entry.first_name} ${entry.last_name}`,
    task_name: entry.task_name,
    created_at: formatDate(entry.created_at)
  }));

  const response = buildPaginatedResponse(formattedEntries, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Get time entries within date range
 * GET /api/time-entries/date-range
 */
const getTimeEntriesByDateRange = asyncHandler(async (req, res) => {
  const { start_date, end_date, user_id, project_id } = req.query;
  const { page, limit, offset } = parsePagination(req.query);

  if (!start_date || !end_date) {
    throw new ValidationError('start_date and end_date are required');
  }

  const whereConditions = [
    'DATE(te.start_time) >= ?',
    'DATE(te.start_time) <= ?'
  ];
  const queryParams = [start_date, end_date];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(req.user.id);
  } else if (user_id && req.user.role === USER_ROLES.MANAGER) {
    whereConditions.push(`
      te.user_id = ? AND te.project_id IN (
        SELECT id FROM projects
        WHERE assigned_to = ? OR created_by = ?
      )
    `);
    queryParams.push(user_id, req.user.id, req.user.id);
  } else if (user_id && req.user.role === USER_ROLES.ADMIN) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(user_id);
  }

  if (project_id) {
    whereConditions.push('te.project_id = ?');
    queryParams.push(project_id);
  }

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  // Get total count
  const countQuery = `
    SELECT COUNT(*) as total
    FROM time_entries te
    ${whereClause}
  `;
  const countResult = await executeQuery(countQuery, queryParams);
  const total = countResult[0].total;

  // Get entries
  const entriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.invoiced, te.is_manual, te.created_at,
           p.name as project_name, c.name as client_name,
           u.first_name, u.last_name, t.name as task_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    INNER JOIN users u ON te.user_id = u.id
    LEFT JOIN tasks t ON te.task_id = t.id
    ${whereClause}
    ORDER BY te.start_time DESC
    LIMIT ? OFFSET ?
  `;

  const entries = await executeQuery(entriesQuery, [...queryParams, limit, offset]);

  const formattedEntries = entries.map(entry => ({
    id: entry.id,
    description: entry.description,
    start_time: formatDate(entry.start_time),
    end_time: formatDate(entry.end_time),
    duration_minutes: entry.duration_minutes || 0,
    duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    hourly_rate: parseFloat(entry.hourly_rate) || 0,
    billable_amount: calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
    billable: Boolean(entry.billable),
    invoiced: Boolean(entry.invoiced),
    is_manual: Boolean(entry.is_manual),
    project_name: entry.project_name,
    client_name: entry.client_name,
    user_name: `${entry.first_name} ${entry.last_name}`,
    task_name: entry.task_name,
    created_at: formatDate(entry.created_at)
  }));

  const response = buildPaginatedResponse(formattedEntries, total, { page, limit });

  res.json({
    status: API_RESPONSE.SUCCESS,
    ...response
  });
});

/**
 * Create multiple time entries
 * POST /api/time-entries/bulk
 */
const createBulkTimeEntries = asyncHandler(async (req, res) => {
  const { entries } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ValidationError('entries array is required');
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    try {
      const entry = entries[i];
      const {
        user_id,
        project_id,
        task_id,
        description,
        start_time,
        end_time,
        hourly_rate,
        billable = true
      } = entry;

      // Validate time range
      const timeValidation = validateTimeRange(start_time, end_time);
      if (!timeValidation.isValid) {
        throw new ValidationError(`Entry ${i + 1}: ${timeValidation.error}`);
      }

      // Create time entry
      const insertQuery = `
        INSERT INTO time_entries (
          user_id, project_id, task_id, description, start_time, end_time,
          duration_minutes, hourly_rate, billable, is_manual, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
      `;

      const result = await executeQuery(insertQuery, [
        user_id,
        project_id,
        task_id || null,
        description || null,
        start_time,
        end_time,
        timeValidation.duration,
        hourly_rate || null,
        billable ? 1 : 0
      ]);

      results.push({
        index: i,
        id: result.insertId,
        success: true
      });

    } catch (error) {
      errors.push({
        index: i,
        error: error.message
      });
    }
  }

  res.status(HTTP_STATUS.CREATED).json({
    status: API_RESPONSE.SUCCESS,
    message: `Created ${results.length} time entries`,
    data: {
      created: results,
      errors: errors,
      total_processed: entries.length,
      successful: results.length,
      failed: errors.length
    }
  });
});

/**
 * Update multiple time entries
 * PUT /api/time-entries/bulk
 */
const updateBulkTimeEntries = asyncHandler(async (req, res) => {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ValidationError('updates array is required');
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < updates.length; i++) {
    try {
      const update = updates[i];
      const { id, ...updateData } = update;

      // Check if entry exists and user has access
      const entryQuery = `
        SELECT te.id, te.user_id, te.invoiced, te.project_id,
               p.assigned_to, p.created_by
        FROM time_entries te
        INNER JOIN projects p ON te.project_id = p.id
        WHERE te.id = ?
      `;

      const entries = await executeQuery(entryQuery, [id]);

      if (entries.length === 0) {
        throw new NotFoundError(`Entry ${id} not found`);
      }

      const entry = entries[0];

      // Check permissions
      if (req.user.role === USER_ROLES.EMPLOYEE && entry.user_id !== req.user.id) {
        throw new AuthorizationError(`Access denied for entry ${id}`);
      }

      // Cannot edit invoiced entries
      if (entry.invoiced) {
        throw new ConflictError(`Cannot edit invoiced entry ${id}`);
      }

      // Build update query
      const updateFields = [];
      const updateValues = [];

      if (updateData.description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(updateData.description);
      }

      if (updateData.billable !== undefined) {
        updateFields.push('billable = ?');
        updateValues.push(updateData.billable ? 1 : 0);
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        updateValues.push(id);

        const updateQuery = `
          UPDATE time_entries
          SET ${updateFields.join(', ')}
          WHERE id = ?
        `;

        await executeQuery(updateQuery, updateValues);
      }

      results.push({
        id: id,
        success: true
      });

    } catch (error) {
      errors.push({
        id: updates[i].id,
        error: error.message
      });
    }
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: `Updated ${results.length} time entries`,
    data: {
      updated: results,
      errors: errors,
      total_processed: updates.length,
      successful: results.length,
      failed: errors.length
    }
  });
});

/**
 * Delete multiple time entries
 * DELETE /api/time-entries/bulk
 */
const deleteBulkTimeEntries = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError('ids array is required');
  }

  const results = [];
  const errors = [];

  for (const id of ids) {
    try {
      // Check if entry exists and user has access
      const entryQuery = `
        SELECT te.id, te.user_id, te.invoiced, te.project_id,
               p.assigned_to, p.created_by
        FROM time_entries te
        INNER JOIN projects p ON te.project_id = p.id
        WHERE te.id = ?
      `;

      const entries = await executeQuery(entryQuery, [id]);

      if (entries.length === 0) {
        throw new NotFoundError(`Entry ${id} not found`);
      }

      const entry = entries[0];

      // Check permissions
      if (req.user.role === USER_ROLES.EMPLOYEE && entry.user_id !== req.user.id) {
        throw new AuthorizationError(`Access denied for entry ${id}`);
      }

      // Cannot delete invoiced entries
      if (entry.invoiced) {
        throw new ConflictError(`Cannot delete invoiced entry ${id}`);
      }

      // Delete entry
      await executeQuery('DELETE FROM time_entries WHERE id = ?', [id]);

      results.push({
        id: id,
        success: true
      });

    } catch (error) {
      errors.push({
        id: id,
        error: error.message
      });
    }
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    message: `Deleted ${results.length} time entries`,
    data: {
      deleted: results,
      errors: errors,
      total_processed: ids.length,
      successful: results.length,
      failed: errors.length
    }
  });
});
/**
 * Export time entries to CSV
 * GET /api/time-entries/export
 */
const exportTimeEntries = asyncHandler(async (req, res) => {
  const { 
    start_date, 
    end_date, 
    project_id, 
    client_id, 
    user_id, 
    billable 
  } = req.query;

  // Build WHERE clause
  const whereConditions = [];
  const queryParams = [];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(req.user.id);
  } else if (user_id && req.user.role === USER_ROLES.MANAGER) {
    whereConditions.push(`
      te.user_id = ? AND te.project_id IN (
        SELECT id FROM projects 
        WHERE assigned_to = ? OR created_by = ?
      )
    `);
    queryParams.push(user_id, req.user.id, req.user.id);
  } else if (user_id) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(user_id);
  }

  if (start_date) {
    whereConditions.push('DATE(te.start_time) >= ?');
    queryParams.push(start_date);
  }

  if (end_date) {
    whereConditions.push('DATE(te.start_time) <= ?');
    queryParams.push(end_date);
  }

  if (project_id) {
    whereConditions.push('te.project_id = ?');
    queryParams.push(project_id);
  }

  if (client_id) {
    whereConditions.push('p.client_id = ?');
    queryParams.push(client_id);
  }

  if (billable !== undefined) {
    whereConditions.push('te.billable = ?');
    queryParams.push(billable === 'true' ? 1 : 0);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Get time entries
  const entriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           te.hourly_rate, te.billable, te.invoiced, te.is_manual, te.created_at,
           p.name as project_name, c.name as client_name, c.company as client_company,
           u.first_name, u.last_name, t.name as task_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    INNER JOIN users u ON te.user_id = u.id
    LEFT JOIN tasks t ON te.task_id = t.id
    ${whereClause}
    ORDER BY te.start_time DESC
  `;

  const entries = await executeQuery(entriesQuery, queryParams);

  // Generate CSV content
  const csvHeaders = [
    'ID', 'User', 'Client', 'Project', 'Task', 'Description',
    'Start Time', 'End Time', 'Duration (Hours)', 'Hourly Rate',
    'Billable Amount', 'Billable', 'Invoiced', 'Manual Entry', 'Created At'
  ];

  const csvRows = entries.map(entry => [
    entry.id,
    `${entry.first_name} ${entry.last_name}`,
    entry.client_company || entry.client_name,
    entry.project_name,
    entry.task_name || '',
    entry.description || '',
    formatDate(entry.start_time),
    formatDate(entry.end_time),
    Math.round((entry.duration_minutes || 0) / 60 * 100) / 100,
    parseFloat(entry.hourly_rate) || 0,
    calculateBillableAmount(entry.duration_minutes, entry.hourly_rate),
    entry.billable ? 'Yes' : 'No',
    entry.invoiced ? 'Yes' : 'No',
    entry.is_manual ? 'Yes' : 'No',
    formatDate(entry.created_at)
  ]);

  const csvContent = [csvHeaders, ...csvRows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const filename = `time_entries_${moment().format('YYYY-MM-DD')}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

/**
 * Get time entries summary/statistics
 * GET /api/time-entries/summary
 */
const getTimeEntriesSummary = asyncHandler(async (req, res) => {
  const { 
    start_date, 
    end_date, 
    project_id, 
    user_id 
  } = req.query;

  // Build WHERE clause
  const whereConditions = [];
  const queryParams = [];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(req.user.id);
  } else if (user_id && req.user.role === USER_ROLES.MANAGER) {
    whereConditions.push(`
      te.user_id = ? AND te.project_id IN (
        SELECT id FROM projects 
        WHERE assigned_to = ? OR created_by = ?
      )
    `);
    queryParams.push(user_id, req.user.id, req.user.id);
  } else if (user_id) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(user_id);
  }

  if (start_date) {
    whereConditions.push('DATE(te.start_time) >= ?');
    queryParams.push(start_date);
  }

  if (end_date) {
    whereConditions.push('DATE(te.start_time) <= ?');
    queryParams.push(end_date);
  }

  if (project_id) {
    whereConditions.push('te.project_id = ?');
    queryParams.push(project_id);
  }

  const whereClause = whereConditions.length > 0 
    ? `WHERE ${whereConditions.join(' AND ')}`
    : '';

  // Get summary statistics
  const summaryQuery = `
    SELECT 
      COUNT(*) as total_entries,
      COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
      COALESCE(SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END), 0) as billable_minutes,
      COALESCE(SUM(CASE WHEN te.billable = 0 THEN te.duration_minutes ELSE 0 END), 0) as non_billable_minutes,
      COALESCE(SUM(CASE WHEN te.billable = 1 THEN (te.duration_minutes / 60) * te.hourly_rate ELSE 0 END), 0) as total_billable_amount,
      COUNT(DISTINCT te.project_id) as projects_worked,
      COUNT(DISTINCT te.user_id) as users_involved
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    ${whereClause}
  `;

  const summaryResult = await executeQuery(summaryQuery, queryParams);
  const summary = summaryResult[0];

  // Get top projects
  const topProjectsQuery = `
    SELECT 
      p.name as project_name,
      c.name as client_name,
      COUNT(*) as entry_count,
      COALESCE(SUM(te.duration_minutes), 0) as total_minutes,
      COALESCE(SUM(CASE WHEN te.billable = 1 THEN (te.duration_minutes / 60) * te.hourly_rate ELSE 0 END), 0) as billable_amount
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    ${whereClause}
    GROUP BY te.project_id, p.name, c.name
    ORDER BY total_minutes DESC
    LIMIT 10
  `;

  const topProjects = await executeQuery(topProjectsQuery, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      summary: {
        total_entries: summary.total_entries,
        total_hours: Math.round(summary.total_minutes / 60 * 100) / 100,
        billable_hours: Math.round(summary.billable_minutes / 60 * 100) / 100,
        non_billable_hours: Math.round(summary.non_billable_minutes / 60 * 100) / 100,
        total_billable_amount: parseFloat(summary.total_billable_amount) || 0,
        projects_worked: summary.projects_worked,
        users_involved: summary.users_involved
      },
      top_projects: topProjects.map(project => ({
        project_name: project.project_name,
        client_name: project.client_name,
        entry_count: project.entry_count,
        total_hours: Math.round(project.total_minutes / 60 * 100) / 100,
        billable_amount: parseFloat(project.billable_amount) || 0
      }))
    }
  });
});

module.exports = {
  getActiveTimeEntry,
  clockIn,
  clockOut,
  getTimeEntries,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getTimeEntryById,
  getCurrentTimeEntry,
  getUserTimeEntries,
  getProjectTimeEntries,
  getTimeEntriesByDateRange,
  createBulkTimeEntries,
  updateBulkTimeEntries,
  deleteBulkTimeEntries,
  exportTimeEntries,
  getTimeEntriesSummary
};
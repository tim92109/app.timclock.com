/**
 * User Controller
 * Handles user listing and manager/team operations
 */

const { executeQuery } = require('../config/database');
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError
} = require('../middleware/errorHandler');
const { API_RESPONSE, USER_ROLES } = require('../utils/constants');

/**
 * Build the nested `manager` object returned with a user row.
 * @param {Object} row - Row with manager_ref_id/manager_first_name/... columns
 * @returns {{id: number, name: string}|null}
 */
const mapManager = (row) => {
  if (row.manager_ref_id === null || row.manager_ref_id === undefined) {
    return null;
  }
  const name = `${row.manager_first_name || ''} ${row.manager_last_name || ''}`.trim()
    || row.manager_username
    || null;
  return { id: row.manager_ref_id, name };
};

/**
 * Get active users, optionally filtered by role and search term
 * GET /api/users
 */
const getUsers = asyncHandler(async (req, res) => {
  const { role, search } = req.query;

  const whereConditions = ['u.is_active = 1'];
  const queryParams = [];

  if (role) {
    whereConditions.push('u.role = ?');
    queryParams.push(role);
  }

  if (search) {
    whereConditions.push('(u.username LIKE ? OR u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)');
    const searchPattern = `%${search}%`;
    queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const query = `
    SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role,
           u.hourly_rate, u.manager_id,
           m.id AS manager_ref_id,
           m.username AS manager_username,
           m.first_name AS manager_first_name,
           m.last_name AS manager_last_name
    FROM users u
    LEFT JOIN users m ON u.manager_id = m.id
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY u.first_name, u.last_name
  `;

  const users = await executeQuery(query, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        hourly_rate: user.hourly_rate === null || user.hourly_rate === undefined
          ? null
          : parseFloat(user.hourly_rate),
        manager_id: user.manager_id === null || user.manager_id === undefined
          ? null
          : user.manager_id,
        manager: mapManager(user)
      }))
    }
  });
});

/**
 * Get the active users who report to the current manager
 * GET /api/users/team
 */
const getTeam = asyncHandler(async (req, res) => {
  const query = `
    SELECT id, username, email, first_name, last_name, role, manager_id
    FROM users
    WHERE manager_id = ? AND is_active = 1
    ORDER BY first_name, last_name
  `;

  const users = await executeQuery(query, [req.user.id]);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { users }
  });
});

/**
 * Get active users who are not yet assigned to any manager
 * GET /api/users/available
 */
const getAvailableEmployees = asyncHandler(async (req, res) => {
  const query = `
    SELECT id, username, email, first_name, last_name, role, manager_id
    FROM users
    WHERE manager_id IS NULL AND is_active = 1
    ORDER BY first_name, last_name
  `;

  const users = await executeQuery(query);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { users }
  });
});

/**
 * Assign (or clear) the manager of a user
 * PUT /api/users/:id/manager
 */
const assignManager = asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { manager_id } = req.body;

  const targetRows = await executeQuery(
    'SELECT id, role, manager_id FROM users WHERE id = ?',
    [targetId]
  );

  if (targetRows.length === 0) {
    throw new NotFoundError('User');
  }

  const target = targetRows[0];
  if (target.role === USER_ROLES.ADMIN) {
    throw new ValidationError('Cannot assign a manager to an admin user');
  }

  let assignedManagerId = null;
  if (manager_id !== null && manager_id !== undefined && manager_id !== '') {
    assignedManagerId = parseInt(manager_id, 10);
    if (Number.isNaN(assignedManagerId) || assignedManagerId < 1) {
      throw new ValidationError('manager_id must be a positive integer or null');
    }

    const managerRows = await executeQuery(
      'SELECT id FROM users WHERE id = ? AND role = ? AND is_active = 1',
      [assignedManagerId, USER_ROLES.MANAGER]
    );

    if (managerRows.length === 0) {
      throw new NotFoundError('Manager');
    }
  }

  if (req.user.role === USER_ROLES.MANAGER) {
    if (assignedManagerId === req.user.id) {
      // Attaching to self: only when the target is unassigned or already ours.
      // Re-adding one's own employee is idempotent; claiming another manager's
      // employee is a conflict.
      if (target.manager_id !== null && target.manager_id !== req.user.id) {
        throw new ConflictError('Employee is already assigned to another manager');
      }
    } else if (assignedManagerId === null) {
      // Releasing: a manager may only release their own employee.
      if (target.manager_id !== req.user.id) {
        throw new AuthorizationError('Managers can only release their own employees');
      }
    } else {
      // Any other manager id is forbidden for managers.
      throw new AuthorizationError('Managers can only assign employees to themselves');
    }
  } else if (req.user.role !== USER_ROLES.ADMIN) {
    throw new AuthorizationError('Access denied');
  }

  await executeQuery(
    'UPDATE users SET manager_id = ?, updated_at = NOW() WHERE id = ?',
    [assignedManagerId, targetId]
  );

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      user: {
        id: targetId,
        manager_id: assignedManagerId
      }
    }
  });
});

module.exports = { getUsers, getTeam, getAvailableEmployees, assignManager };

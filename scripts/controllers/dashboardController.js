/**
 * Dashboard Controller
 * Handles dashboard data and reporting operations
 */

const { executeQuery } = require('../config/database');
const { 
  asyncHandler 
} = require('../middleware/errorHandler');
const { 
  API_RESPONSE,
  USER_ROLES 
} = require('../utils/constants');
const { 
  formatDate,
  calculateBillableAmount 
} = require('../utils/helpers');

/**
 * Get dashboard overview data
 * GET /api/dashboard
 * GET /api/dashboard/overview
 */
const getDashboardOverview = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  // Build stats based on role
  let stats = {};
  let recentActivity = [];
  let upcomingDeadlines = [];

  // Get this week's time entries (Sunday to now)
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const hoursThisWeekQuery = `
    SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
    FROM time_entries
    WHERE user_id = ? AND start_time >= ?
  `;

  // Get today's hours
  const hoursTodayQuery = `
    SELECT COALESCE(SUM(duration_minutes), 0) as total_minutes
    FROM time_entries
    WHERE user_id = ? AND DATE(start_time) = CURDATE()
  `;

  // Get active projects count
  const activeProjectsQuery = `
    SELECT COUNT(*) as count
    FROM projects
    WHERE status = 'active' AND is_active = 1
    ${userRole === USER_ROLES.EMPLOYEE ? 'AND assigned_to = ?' : ''}
  `;

  // Get recent activity (last 7 days)
  const recentActivityQuery = `
    SELECT te.id, te.description as task_description, te.start_time, te.duration_minutes as duration,
           p.name as project_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE te.user_id = ? AND te.start_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    ORDER BY te.start_time DESC
    LIMIT 10
  `;

  // Get upcoming deadlines (next 30 days)
  const upcomingDeadlinesQuery = `
    SELECT p.name as project_name, c.name as client_name, p.due_date as deadline
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.due_date >= CURDATE() AND p.due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      AND p.status IN ('active', 'open') AND p.is_active = 1
    ${userRole === USER_ROLES.EMPLOYEE ? 'AND p.assigned_to = ?' : ''}
    ORDER BY p.due_date ASC
    LIMIT 10
  `;

  if (userRole === USER_ROLES.EMPLOYEE) {
    const [hoursWeek, hoursToday, activeProjects, activity, deadlines] = await Promise.all([
      executeQuery(hoursThisWeekQuery, [userId, weekStart]),
      executeQuery(hoursTodayQuery, [userId]),
      executeQuery(activeProjectsQuery, [userId]),
      executeQuery(recentActivityQuery, [userId]),
      executeQuery(upcomingDeadlinesQuery, [userId])
    ]);

    stats = {
      hoursThisWeek: Math.round((hoursWeek[0].total_minutes || 0) / 60 * 100) / 100,
      hoursToday: Math.round((hoursToday[0].total_minutes || 0) / 60 * 100) / 100,
      activeProjects: activeProjects[0].count || 0,
      totalClients: 0, // Employee doesn't see this
      revenueThisMonth: 0 // Employee doesn't see this
    };
    recentActivity = activity;
    upcomingDeadlines = deadlines;
  } else {
    // Manager/Admin get broader stats
    const [hoursWeek, hoursToday, activeProjects, activity, deadlines] = await Promise.all([
      executeQuery(hoursThisWeekQuery, [userId, weekStart]),
      executeQuery(hoursTodayQuery, [userId]),
      executeQuery(activeProjectsQuery),
      executeQuery(recentActivityQuery, [userId]),
      executeQuery(upcomingDeadlinesQuery)
    ]);

    // Get total clients
    const totalClientsQuery = `SELECT COUNT(*) as count FROM clients WHERE is_active = 1`;
    const totalClientsResult = await executeQuery(totalClientsQuery);

    // Get revenue this month
    const revenueQuery = `
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM invoices
      WHERE status = 'paid' AND MONTH(paid_date) = MONTH(CURDATE()) AND YEAR(paid_date) = YEAR(CURDATE())
    `;
    const revenueResult = await executeQuery(revenueQuery);

    stats = {
      hoursThisWeek: Math.round((hoursWeek[0].total_minutes || 0) / 60 * 100) / 100,
      hoursToday: Math.round((hoursToday[0].total_minutes || 0) / 60 * 100) / 100,
      activeProjects: activeProjects[0].count || 0,
      totalClients: totalClientsResult[0].count || 0,
      revenueThisMonth: parseFloat(revenueResult[0].total) || 0
    };
    recentActivity = activity;
    upcomingDeadlines = deadlines;
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      stats,
      recentActivity: recentActivity.map(a => ({
        project_name: a.project_name,
        task_description: a.task_description,
        start_time: a.start_time,
        duration: a.duration
      })),
      upcomingDeadlines: upcomingDeadlines.map(d => ({
        project_name: d.project_name,
        client_name: d.client_name,
        deadline: d.deadline
      }))
    }
  });
});

/**
 * Get admin overview data
 */
const getAdminOverview = async () => {
  // Get user statistics
  const userStatsQuery = `
    SELECT 
      COUNT(*) as total_users,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
      SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_users,
      SUM(CASE WHEN role = 'manager' THEN 1 ELSE 0 END) as manager_users,
      SUM(CASE WHEN role = 'employee' THEN 1 ELSE 0 END) as employee_users
    FROM users
  `;

  // Get client statistics
  const clientStatsQuery = `
    SELECT 
      COUNT(*) as total_clients,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_clients
    FROM clients
  `;

  // Get project statistics
  const projectStatsQuery = `
    SELECT 
      COUNT(*) as total_projects,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_projects,
      SUM(estimated_hours) as total_estimated_hours,
      SUM(actual_hours) as total_actual_hours
    FROM projects
    WHERE is_active = 1
  `;

  // Get time tracking statistics
  const timeStatsQuery = `
    SELECT 
      COUNT(*) as total_time_entries,
      SUM(duration_minutes) as total_minutes,
      SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END) as billable_minutes,
      COUNT(DISTINCT user_id) as active_users_today
    FROM time_entries
    WHERE DATE(start_time) = CURDATE()
  `;

  // Get invoice statistics
  const invoiceStatsQuery = `
    SELECT 
      COUNT(*) as total_invoices,
      SUM(total_amount) as total_invoiced,
      SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END) as total_paid,
      SUM(CASE WHEN status = 'sent' THEN total_amount ELSE 0 END) as total_outstanding
    FROM invoices
  `;

  // Get recent activity
  const recentActivityQuery = `
    (SELECT 'time_entry' as type, te.id, te.created_at, 
            CONCAT(u.first_name, ' ', u.last_name) as user_name,
            CONCAT('Logged time for ', p.name) as description
     FROM time_entries te
     INNER JOIN users u ON te.user_id = u.id
     INNER JOIN projects p ON te.project_id = p.id
     WHERE te.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     ORDER BY te.created_at DESC
     LIMIT 5)
    UNION ALL
    (SELECT 'project' as type, p.id, p.created_at,
            CONCAT(u.first_name, ' ', u.last_name) as user_name,
            CONCAT('Created project: ', p.name) as description
     FROM projects p
     INNER JOIN users u ON p.created_by = u.id
     WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     ORDER BY p.created_at DESC
     LIMIT 5)
    ORDER BY created_at DESC
    LIMIT 10
  `;

  const [userStats, clientStats, projectStats, timeStats, invoiceStats, recentActivity] = await Promise.all([
    executeQuery(userStatsQuery),
    executeQuery(clientStatsQuery),
    executeQuery(projectStatsQuery),
    executeQuery(timeStatsQuery),
    executeQuery(invoiceStatsQuery),
    executeQuery(recentActivityQuery)
  ]);

  return {
    users: {
      total: userStats[0].total_users || 0,
      active: userStats[0].active_users || 0,
      admins: userStats[0].admin_users || 0,
      managers: userStats[0].manager_users || 0,
      employees: userStats[0].employee_users || 0
    },
    clients: {
      total: clientStats[0].total_clients || 0,
      active: clientStats[0].active_clients || 0
    },
    projects: {
      total: projectStats[0].total_projects || 0,
      active: projectStats[0].active_projects || 0,
      completed: projectStats[0].completed_projects || 0,
      estimated_hours: parseFloat(projectStats[0].total_estimated_hours) || 0,
      actual_hours: parseFloat(projectStats[0].total_actual_hours) || 0
    },
    time_tracking: {
      today_entries: timeStats[0].total_time_entries || 0,
      today_hours: Math.round((timeStats[0].total_minutes || 0) / 60 * 100) / 100,
      today_billable_hours: Math.round((timeStats[0].billable_minutes || 0) / 60 * 100) / 100,
      active_users_today: timeStats[0].active_users_today || 0
    },
    billing: {
      total_invoices: invoiceStats[0].total_invoices || 0,
      total_invoiced: parseFloat(invoiceStats[0].total_invoiced) || 0,
      total_paid: parseFloat(invoiceStats[0].total_paid) || 0,
      total_outstanding: parseFloat(invoiceStats[0].total_outstanding) || 0
    },
    recent_activity: recentActivity.map(activity => ({
      type: activity.type,
      id: activity.id,
      user_name: activity.user_name,
      description: activity.description,
      created_at: formatDate(activity.created_at)
    }))
  };
};

/**
 * Get manager overview data
 */
const getManagerOverview = async (userId) => {
  // Get projects managed by this user
  const projectStatsQuery = `
    SELECT 
      COUNT(*) as total_projects,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_projects,
      SUM(estimated_hours) as total_estimated_hours,
      SUM(actual_hours) as total_actual_hours
    FROM projects
    WHERE (assigned_to = ? OR created_by = ?) AND is_active = 1
  `;

  // Get team time tracking statistics
  const teamTimeStatsQuery = `
    SELECT 
      COUNT(DISTINCT te.user_id) as team_members,
      COUNT(*) as total_time_entries,
      SUM(te.duration_minutes) as total_minutes,
      SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE (p.assigned_to = ? OR p.created_by = ?) 
      AND DATE(te.start_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `;

  // Get active time entries for team
  const activeTimeEntriesQuery = `
    SELECT te.id, te.start_time, te.description,
           u.first_name, u.last_name,
           p.name as project_name, c.name as client_name
    FROM time_entries te
    INNER JOIN users u ON te.user_id = u.id
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE te.end_time IS NULL 
      AND (p.assigned_to = ? OR p.created_by = ?)
    ORDER BY te.start_time DESC
  `;

  // Get recent projects
  const recentProjectsQuery = `
    SELECT p.id, p.name, p.status, p.due_date, p.actual_hours,
           c.name as client_name
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE (p.assigned_to = ? OR p.created_by = ?) AND p.is_active = 1
    ORDER BY p.updated_at DESC
    LIMIT 5
  `;

  const [projectStats, teamTimeStats, activeTimeEntries, recentProjects] = await Promise.all([
    executeQuery(projectStatsQuery, [userId, userId]),
    executeQuery(teamTimeStatsQuery, [userId, userId]),
    executeQuery(activeTimeEntriesQuery, [userId, userId]),
    executeQuery(recentProjectsQuery, [userId, userId])
  ]);

  return {
    projects: {
      total: projectStats[0].total_projects || 0,
      active: projectStats[0].active_projects || 0,
      completed: projectStats[0].completed_projects || 0,
      estimated_hours: parseFloat(projectStats[0].total_estimated_hours) || 0,
      actual_hours: parseFloat(projectStats[0].total_actual_hours) || 0
    },
    team: {
      members: teamTimeStats[0].team_members || 0,
      time_entries_30d: teamTimeStats[0].total_time_entries || 0,
      hours_30d: Math.round((teamTimeStats[0].total_minutes || 0) / 60 * 100) / 100,
      billable_hours_30d: Math.round((teamTimeStats[0].billable_minutes || 0) / 60 * 100) / 100
    },
    active_time_entries: activeTimeEntries.map(entry => ({
      id: entry.id,
      user_name: `${entry.first_name} ${entry.last_name}`,
      project_name: entry.project_name,
      client_name: entry.client_name,
      description: entry.description,
      start_time: formatDate(entry.start_time),
      duration_minutes: Math.floor((new Date() - new Date(entry.start_time)) / 60000)
    })),
    recent_projects: recentProjects.map(project => ({
      id: project.id,
      name: project.name,
      status: project.status,
      client_name: project.client_name,
      due_date: formatDate(project.due_date),
      actual_hours: parseFloat(project.actual_hours) || 0
    }))
  };
};

/**
 * Get employee overview data
 */
const getEmployeeOverview = async (userId) => {
  // Get user's project statistics
  const projectStatsQuery = `
    SELECT 
      COUNT(*) as total_projects,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_projects,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed_projects
    FROM projects
    WHERE assigned_to = ? AND is_active = 1
  `;

  // Get user's time tracking statistics
  const timeStatsQuery = `
    SELECT 
      COUNT(*) as total_time_entries,
      SUM(duration_minutes) as total_minutes,
      SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END) as billable_minutes
    FROM time_entries
    WHERE user_id = ? AND DATE(start_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `;

  // Get today's time tracking
  const todayTimeQuery = `
    SELECT 
      COUNT(*) as today_entries,
      SUM(duration_minutes) as today_minutes,
      SUM(CASE WHEN billable = 1 THEN duration_minutes ELSE 0 END) as today_billable_minutes
    FROM time_entries
    WHERE user_id = ? AND DATE(start_time) = CURDATE()
  `;

  // Get active time entry
  const activeTimeQuery = `
    SELECT te.id, te.start_time, te.description,
           p.name as project_name, c.name as client_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ? AND te.end_time IS NULL
    ORDER BY te.start_time DESC
    LIMIT 1
  `;

  // Get recent time entries
  const recentTimeEntriesQuery = `
    SELECT te.id, te.description, te.start_time, te.end_time, te.duration_minutes,
           p.name as project_name, c.name as client_name
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE te.user_id = ?
    ORDER BY te.start_time DESC
    LIMIT 5
  `;

  // Get assigned projects
  const assignedProjectsQuery = `
    SELECT p.id, p.name, p.status, p.due_date, p.actual_hours,
           c.name as client_name
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.assigned_to = ? AND p.is_active = 1
    ORDER BY p.due_date ASC
    LIMIT 5
  `;

  const [projectStats, timeStats, todayTime, activeTime, recentTimeEntries, assignedProjects] = await Promise.all([
    executeQuery(projectStatsQuery, [userId]),
    executeQuery(timeStatsQuery, [userId]),
    executeQuery(todayTimeQuery, [userId]),
    executeQuery(activeTimeQuery, [userId]),
    executeQuery(recentTimeEntriesQuery, [userId]),
    executeQuery(assignedProjectsQuery, [userId])
  ]);

  return {
    projects: {
      total: projectStats[0].total_projects || 0,
      active: projectStats[0].active_projects || 0,
      completed: projectStats[0].completed_projects || 0
    },
    time_tracking: {
      entries_30d: timeStats[0].total_time_entries || 0,
      hours_30d: Math.round((timeStats[0].total_minutes || 0) / 60 * 100) / 100,
      billable_hours_30d: Math.round((timeStats[0].billable_minutes || 0) / 60 * 100) / 100,
      today_entries: todayTime[0].today_entries || 0,
      today_hours: Math.round((todayTime[0].today_minutes || 0) / 60 * 100) / 100,
      today_billable_hours: Math.round((todayTime[0].today_billable_minutes || 0) / 60 * 100) / 100
    },
    active_time_entry: activeTime.length > 0 ? {
      id: activeTime[0].id,
      project_name: activeTime[0].project_name,
      client_name: activeTime[0].client_name,
      description: activeTime[0].description,
      start_time: formatDate(activeTime[0].start_time),
      duration_minutes: Math.floor((new Date() - new Date(activeTime[0].start_time)) / 60000)
    } : null,
    recent_time_entries: recentTimeEntries.map(entry => ({
      id: entry.id,
      project_name: entry.project_name,
      client_name: entry.client_name,
      description: entry.description,
      start_time: formatDate(entry.start_time),
      end_time: formatDate(entry.end_time),
      duration_hours: Math.round((entry.duration_minutes || 0) / 60 * 100) / 100
    })),
    assigned_projects: assignedProjects.map(project => ({
      id: project.id,
      name: project.name,
      status: project.status,
      client_name: project.client_name,
      due_date: formatDate(project.due_date),
      actual_hours: parseFloat(project.actual_hours) || 0
    }))
  };
};

/**
 * Get time report data
 * GET /api/dashboard/time-report
 */
const getTimeReport = asyncHandler(async (req, res) => {
  const { 
    start_date, 
    end_date, 
    user_id, 
    project_id, 
    client_id,
    group_by = 'day' 
  } = req.query;

  // Build WHERE clause
  const whereConditions = ['1=1'];
  const queryParams = [];

  // Role-based filtering
  if (req.user.role === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(req.user.id);
  } else if (user_id && req.user.role !== USER_ROLES.ADMIN) {
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

  const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

  // Determine grouping
  let groupByClause, selectClause;
  
  switch (group_by) {
    case 'week':
      selectClause = 'YEARWEEK(te.start_time) as period, DATE(DATE_SUB(te.start_time, INTERVAL WEEKDAY(te.start_time) DAY)) as period_start';
      groupByClause = 'GROUP BY YEARWEEK(te.start_time)';
      break;
    case 'month':
      selectClause = 'DATE_FORMAT(te.start_time, "%Y-%m") as period, DATE_FORMAT(te.start_time, "%Y-%m-01") as period_start';
      groupByClause = 'GROUP BY DATE_FORMAT(te.start_time, "%Y-%m")';
      break;
    case 'user':
      selectClause = 'te.user_id as period, CONCAT(u.first_name, " ", u.last_name) as period_label';
      groupByClause = 'GROUP BY te.user_id';
      break;
    case 'project':
      selectClause = 'te.project_id as period, p.name as period_label';
      groupByClause = 'GROUP BY te.project_id';
      break;
    case 'client':
      selectClause = 'p.client_id as period, c.name as period_label';
      groupByClause = 'GROUP BY p.client_id';
      break;
    default: // day
      selectClause = 'DATE(te.start_time) as period, DATE(te.start_time) as period_start';
      groupByClause = 'GROUP BY DATE(te.start_time)';
  }

  const reportQuery = `
    SELECT 
      ${selectClause},
      COUNT(*) as total_entries,
      SUM(te.duration_minutes) as total_minutes,
      SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes,
      SUM(CASE WHEN te.billable = 1 AND te.hourly_rate IS NOT NULL 
          THEN (te.duration_minutes / 60) * te.hourly_rate ELSE 0 END) as billable_amount
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    INNER JOIN users u ON te.user_id = u.id
    ${whereClause}
    ${groupByClause}
    ORDER BY period
  `;

  const reportData = await executeQuery(reportQuery, queryParams);

  const formattedData = reportData.map(row => ({
    period: row.period,
    period_label: row.period_label || formatDate(row.period_start || row.period),
    total_entries: row.total_entries || 0,
    total_hours: Math.round((row.total_minutes || 0) / 60 * 100) / 100,
    billable_hours: Math.round((row.billable_minutes || 0) / 60 * 100) / 100,
    billable_amount: parseFloat(row.billable_amount) || 0
  }));

  // Calculate totals
  const totals = reportData.reduce((acc, row) => ({
    total_entries: acc.total_entries + (row.total_entries || 0),
    total_hours: acc.total_hours + ((row.total_minutes || 0) / 60),
    billable_hours: acc.billable_hours + ((row.billable_minutes || 0) / 60),
    billable_amount: acc.billable_amount + (parseFloat(row.billable_amount) || 0)
  }), { total_entries: 0, total_hours: 0, billable_hours: 0, billable_amount: 0 });

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      report: formattedData,
      totals: {
        total_entries: totals.total_entries,
        total_hours: Math.round(totals.total_hours * 100) / 100,
        billable_hours: Math.round(totals.billable_hours * 100) / 100,
        billable_amount: Math.round(totals.billable_amount * 100) / 100
      },
      filters: {
        start_date,
        end_date,
        user_id,
        project_id,
        client_id,
        group_by
      }
    }
  });
});

/**
 * Get dashboard statistics
 * GET /api/dashboard/stats
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  // Forward to the overview handler for consistent data format
  return getDashboardOverview(req, res);
});

/**
 * Get time tracking dashboard data
 * GET /api/dashboard/time-tracking
 */
const getTimeTrackingDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  let whereConditions = ['1=1'];
  let queryParams = [];

  // Role-based filtering
  if (userRole === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(userId);
  } else if (userRole === USER_ROLES.MANAGER) {
    whereConditions.push('(p.assigned_to = ? OR p.created_by = ?)');
    queryParams.push(userId, userId);
  }

  const timeTrackingQuery = `
    SELECT
      COUNT(*) as total_entries,
      SUM(te.duration_minutes) as total_minutes,
      SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes,
      COUNT(DISTINCT te.user_id) as active_users,
      COUNT(DISTINCT te.project_id) as active_projects
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    WHERE ${whereConditions.join(' AND ')}
      AND DATE(te.start_time) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
  `;

  const stats = await executeQuery(timeTrackingQuery, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      time_tracking: {
        total_entries: stats[0].total_entries || 0,
        total_hours: Math.round((stats[0].total_minutes || 0) / 60 * 100) / 100,
        billable_hours: Math.round((stats[0].billable_minutes || 0) / 60 * 100) / 100,
        active_users: stats[0].active_users || 0,
        active_projects: stats[0].active_projects || 0
      }
    }
  });
});

/**
 * Get projects dashboard data
 * GET /api/dashboard/projects
 */
const getProjectsDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  let whereConditions = ['p.is_active = 1'];
  let queryParams = [];

  // Role-based filtering
  if (userRole === USER_ROLES.EMPLOYEE) {
    whereConditions.push('p.assigned_to = ?');
    queryParams.push(userId);
  } else if (userRole === USER_ROLES.MANAGER) {
    whereConditions.push('(p.assigned_to = ? OR p.created_by = ?)');
    queryParams.push(userId, userId);
  }

  const projectsQuery = `
    SELECT
      COUNT(*) as total_projects,
      SUM(CASE WHEN p.status = 'active' THEN 1 ELSE 0 END) as active_projects,
      SUM(CASE WHEN p.status = 'complete' THEN 1 ELSE 0 END) as completed_projects,
      SUM(CASE WHEN p.due_date < CURDATE() AND p.status != 'complete' THEN 1 ELSE 0 END) as overdue_projects,
      AVG(p.actual_hours / NULLIF(p.estimated_hours, 0)) as avg_completion_rate
    FROM projects p
    WHERE ${whereConditions.join(' AND ')}
  `;

  const stats = await executeQuery(projectsQuery, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      projects: {
        total: stats[0].total_projects || 0,
        active: stats[0].active_projects || 0,
        completed: stats[0].completed_projects || 0,
        overdue: stats[0].overdue_projects || 0,
        avg_completion_rate: parseFloat(stats[0].avg_completion_rate) || 0
      }
    }
  });
});

/**
 * Get clients dashboard data
 * GET /api/dashboard/clients
 */
const getClientsDashboard = asyncHandler(async (req, res) => {
  const clientsQuery = `
    SELECT
      COUNT(*) as total_clients,
      SUM(CASE WHEN c.is_active = 1 THEN 1 ELSE 0 END) as active_clients,
      COUNT(DISTINCT p.id) as total_projects,
      SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as total_revenue
    FROM clients c
    LEFT JOIN projects p ON c.id = p.client_id
    LEFT JOIN invoices i ON c.id = i.client_id
  `;

  const stats = await executeQuery(clientsQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      clients: {
        total: stats[0].total_clients || 0,
        active: stats[0].active_clients || 0,
        total_projects: stats[0].total_projects || 0,
        total_revenue: parseFloat(stats[0].total_revenue) || 0
      }
    }
  });
});

/**
 * Get billing dashboard data
 * GET /api/dashboard/billing
 */
const getBillingDashboard = asyncHandler(async (req, res) => {
  const billingQuery = `
    SELECT
      COUNT(*) as total_invoices,
      SUM(i.total_amount) as total_invoiced,
      SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as total_paid,
      SUM(CASE WHEN i.status = 'sent' THEN i.total_amount ELSE 0 END) as total_outstanding,
      SUM(CASE WHEN i.due_date < CURDATE() AND i.status != 'paid' THEN i.total_amount ELSE 0 END) as total_overdue
    FROM invoices i
  `;

  const stats = await executeQuery(billingQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      billing: {
        total_invoices: stats[0].total_invoices || 0,
        total_invoiced: parseFloat(stats[0].total_invoiced) || 0,
        total_paid: parseFloat(stats[0].total_paid) || 0,
        total_outstanding: parseFloat(stats[0].total_outstanding) || 0,
        total_overdue: parseFloat(stats[0].total_overdue) || 0
      }
    }
  });
});

/**
 * Get team dashboard data
 * GET /api/dashboard/team
 */
const getTeamDashboard = asyncHandler(async (req, res) => {
  const teamQuery = `
    SELECT
      COUNT(*) as total_users,
      SUM(CASE WHEN u.is_active = 1 THEN 1 ELSE 0 END) as active_users,
      SUM(CASE WHEN u.last_login >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as active_this_week
    FROM users u
    WHERE u.role != 'admin'
  `;

  const stats = await executeQuery(teamQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      team: {
        total_users: stats[0].total_users || 0,
        active_users: stats[0].active_users || 0,
        active_this_week: stats[0].active_this_week || 0
      }
    }
  });
});

/**
 * Get productivity report
 * GET /api/dashboard/reports/productivity
 */
const getProductivityReport = asyncHandler(async (req, res) => {
  const productivityQuery = `
    SELECT
      u.id, u.first_name, u.last_name,
      COUNT(te.id) as total_entries,
      SUM(te.duration_minutes) as total_minutes,
      SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes,
      COUNT(DISTINCT te.project_id) as projects_worked
    FROM users u
    LEFT JOIN time_entries te ON u.id = te.user_id
      AND te.start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    WHERE u.role != 'admin' AND u.is_active = 1
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY total_minutes DESC
  `;

  const productivity = await executeQuery(productivityQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      productivity: productivity.map(user => ({
        user_id: user.id,
        user_name: `${user.first_name} ${user.last_name}`,
        total_entries: user.total_entries || 0,
        total_hours: Math.round((user.total_minutes || 0) / 60 * 100) / 100,
        billable_hours: Math.round((user.billable_minutes || 0) / 60 * 100) / 100,
        projects_worked: user.projects_worked || 0
      }))
    }
  });
});

/**
 * Get time summary report
 * GET /api/dashboard/reports/time-summary
 */
const getTimeSummaryReport = asyncHandler(async (req, res) => {
  // Reuse the getTimeReport logic
  return getTimeReport(req, res);
});

/**
 * Get project progress report
 * GET /api/dashboard/reports/project-progress
 */
const getProjectProgressReport = asyncHandler(async (req, res) => {
  const progressQuery = `
    SELECT
      p.id, p.name, p.status, p.estimated_hours, p.actual_hours, p.due_date,
      c.name as client_name,
      (p.actual_hours / NULLIF(p.estimated_hours, 0)) * 100 as completion_percentage
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.is_active = 1
    ORDER BY completion_percentage DESC
  `;

  const progress = await executeQuery(progressQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      project_progress: progress.map(project => ({
        id: project.id,
        name: project.name,
        status: project.status,
        client_name: project.client_name,
        estimated_hours: parseFloat(project.estimated_hours) || 0,
        actual_hours: parseFloat(project.actual_hours) || 0,
        completion_percentage: Math.min(parseFloat(project.completion_percentage) || 0, 100),
        due_date: formatDate(project.due_date),
        is_overdue: project.due_date < new Date() && project.status !== 'complete'
      }))
    }
  });
});

/**
 * Get time distribution chart data
 * GET /api/dashboard/charts/time-distribution
 */
const getTimeDistributionChart = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  let whereConditions = ['1=1'];
  let queryParams = [];

  // Role-based filtering
  if (userRole === USER_ROLES.EMPLOYEE) {
    whereConditions.push('te.user_id = ?');
    queryParams.push(userId);
  }

  const distributionQuery = `
    SELECT
      p.name as project_name,
      c.name as client_name,
      SUM(te.duration_minutes) as total_minutes
    FROM time_entries te
    INNER JOIN projects p ON te.project_id = p.id
    INNER JOIN clients c ON p.client_id = c.id
    WHERE ${whereConditions.join(' AND ')}
      AND te.start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY p.id, p.name, c.name
    ORDER BY total_minutes DESC
    LIMIT 10
  `;

  const distribution = await executeQuery(distributionQuery, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      time_distribution: distribution.map(item => ({
        project_name: item.project_name,
        client_name: item.client_name,
        hours: Math.round((item.total_minutes || 0) / 60 * 100) / 100,
        percentage: 0 // Would need total to calculate percentage
      }))
    }
  });
});

/**
 * Get project hours chart data
 * GET /api/dashboard/charts/project-hours
 */
const getProjectHoursChart = asyncHandler(async (req, res) => {
  const projectHoursQuery = `
    SELECT
      p.name as project_name,
      p.estimated_hours,
      p.actual_hours,
      c.name as client_name
    FROM projects p
    INNER JOIN clients c ON p.client_id = c.id
    WHERE p.is_active = 1 AND p.estimated_hours > 0
    ORDER BY p.actual_hours DESC
    LIMIT 10
  `;

  const projectHours = await executeQuery(projectHoursQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      project_hours: projectHours.map(project => ({
        project_name: project.project_name,
        client_name: project.client_name,
        estimated_hours: parseFloat(project.estimated_hours) || 0,
        actual_hours: parseFloat(project.actual_hours) || 0
      }))
    }
  });
});

/**
 * Get revenue trend chart data
 * GET /api/dashboard/charts/revenue-trend
 */
const getRevenueTrendChart = asyncHandler(async (req, res) => {
  const revenueTrendQuery = `
    SELECT
      DATE_FORMAT(i.issue_date, '%Y-%m') as month,
      SUM(i.total_amount) as total_revenue,
      SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END) as paid_revenue
    FROM invoices i
    WHERE i.issue_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
    GROUP BY DATE_FORMAT(i.issue_date, '%Y-%m')
    ORDER BY month
  `;

  const revenueTrend = await executeQuery(revenueTrendQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      revenue_trend: revenueTrend.map(item => ({
        month: item.month,
        total_revenue: parseFloat(item.total_revenue) || 0,
        paid_revenue: parseFloat(item.paid_revenue) || 0
      }))
    }
  });
});

/**
 * Get team performance chart data
 * GET /api/dashboard/charts/team-performance
 */
const getTeamPerformanceChart = asyncHandler(async (req, res) => {
  const teamPerformanceQuery = `
    SELECT
      u.first_name, u.last_name,
      SUM(te.duration_minutes) as total_minutes,
      SUM(CASE WHEN te.billable = 1 THEN te.duration_minutes ELSE 0 END) as billable_minutes,
      COUNT(DISTINCT te.project_id) as projects_count
    FROM users u
    LEFT JOIN time_entries te ON u.id = te.user_id
      AND te.start_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    WHERE u.role != 'admin' AND u.is_active = 1
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY total_minutes DESC
  `;

  const teamPerformance = await executeQuery(teamPerformanceQuery);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      team_performance: teamPerformance.map(member => ({
        user_name: `${member.first_name} ${member.last_name}`,
        total_hours: Math.round((member.total_minutes || 0) / 60 * 100) / 100,
        billable_hours: Math.round((member.billable_minutes || 0) / 60 * 100) / 100,
        projects_count: member.projects_count || 0
      }))
    }
  });
});

/**
 * Get recent activity feed
 * GET /api/dashboard/recent-activity
 */
const getRecentActivity = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  let activityQuery;
  let queryParams = [];

  if (userRole === USER_ROLES.EMPLOYEE) {
    activityQuery = `
      SELECT 'time_entry' as type, te.id, te.created_at,
             CONCAT('Logged time for ', p.name) as description
      FROM time_entries te
      INNER JOIN projects p ON te.project_id = p.id
      WHERE te.user_id = ? AND te.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY te.created_at DESC
      LIMIT 10
    `;
    queryParams = [userId];
  } else {
    activityQuery = `
      (SELECT 'time_entry' as type, te.id, te.created_at,
              CONCAT(u.first_name, ' ', u.last_name, ' logged time for ', p.name) as description
       FROM time_entries te
       INNER JOIN users u ON te.user_id = u.id
       INNER JOIN projects p ON te.project_id = p.id
       WHERE te.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY te.created_at DESC
       LIMIT 5)
      UNION ALL
      (SELECT 'project' as type, p.id, p.created_at,
              CONCAT('New project created: ', p.name) as description
       FROM projects p
       WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ORDER BY p.created_at DESC
       LIMIT 5)
      ORDER BY created_at DESC
      LIMIT 10
    `;
  }

  const activities = await executeQuery(activityQuery, queryParams);

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: {
      recent_activity: activities.map(activity => ({
        type: activity.type,
        id: activity.id,
        description: activity.description,
        created_at: formatDate(activity.created_at)
      }))
    }
  });
});

/**
 * Get dashboard notifications
 * GET /api/dashboard/notifications
 */
const getDashboardNotifications = asyncHandler(async (req, res) => {
  const notifications = [];

  // Check for overdue projects
  const overdueProjectsQuery = `
    SELECT COUNT(*) as count FROM projects
    WHERE due_date < CURDATE() AND status != 'complete' AND is_active = 1
  `;
  const overdueProjects = await executeQuery(overdueProjectsQuery);
  
  if (overdueProjects[0].count > 0) {
    notifications.push({
      type: 'warning',
      message: `${overdueProjects[0].count} project(s) are overdue`,
      action_url: '/projects?filter=overdue'
    });
  }

  // Check for overdue invoices
  const overdueInvoicesQuery = `
    SELECT COUNT(*) as count FROM invoices
    WHERE due_date < CURDATE() AND status != 'paid'
  `;
  const overdueInvoices = await executeQuery(overdueInvoicesQuery);
  
  if (overdueInvoices[0].count > 0) {
    notifications.push({
      type: 'error',
      message: `${overdueInvoices[0].count} invoice(s) are overdue`,
      action_url: '/billing/invoices?filter=overdue'
    });
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { notifications }
  });
});

/**
 * Get available quick actions for user
 * GET /api/dashboard/quick-actions
 */
const getQuickActions = asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  const quickActions = [];

  // Common actions for all users
  quickActions.push(
    { name: 'Clock In', url: '/time/clock-in', icon: 'play' },
    { name: 'View Time Entries', url: '/time/entries', icon: 'clock' }
  );

  // Manager and Admin actions
  if (userRole === USER_ROLES.MANAGER || userRole === USER_ROLES.ADMIN) {
    quickActions.push(
      { name: 'Create Project', url: '/projects/create', icon: 'plus' },
      { name: 'View Reports', url: '/reports', icon: 'chart' }
    );
  }

  // Admin-only actions
  if (userRole === USER_ROLES.ADMIN) {
    quickActions.push(
      { name: 'Create Invoice', url: '/billing/invoices/create', icon: 'file-text' },
      { name: 'Manage Users', url: '/users', icon: 'users' }
    );
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { quick_actions: quickActions }
  });
});

/**
 * Get dashboard widgets configuration
 * GET /api/dashboard/widgets
 */
const getDashboardWidgets = asyncHandler(async (req, res) => {
  const userRole = req.user.role;
  const widgets = [];

  // Common widgets
  widgets.push(
    { id: 'time-tracking', name: 'Time Tracking', enabled: true, position: 1 },
    { id: 'recent-activity', name: 'Recent Activity', enabled: true, position: 2 }
  );

  // Role-specific widgets
  if (userRole === USER_ROLES.MANAGER || userRole === USER_ROLES.ADMIN) {
    widgets.push(
      { id: 'projects-overview', name: 'Projects Overview', enabled: true, position: 3 },
      { id: 'team-performance', name: 'Team Performance', enabled: true, position: 4 }
    );
  }

  if (userRole === USER_ROLES.ADMIN) {
    widgets.push(
      { id: 'billing-overview', name: 'Billing Overview', enabled: true, position: 5 },
      { id: 'revenue-chart', name: 'Revenue Chart', enabled: true, position: 6 }
    );
  }

  res.json({
    status: API_RESPONSE.SUCCESS,
    data: { widgets }
  });
});

/**
 * Update dashboard widgets configuration
 * POST /api/dashboard/widgets
 */
const updateDashboardWidgets = asyncHandler(async (req, res) => {
  const { widgets } = req.body;

  // In a real implementation, you would save this to a user_preferences table
  // For now, just return success
  res.json({
    status: API_RESPONSE.SUCCESS,
    message: 'Dashboard widgets updated successfully',
    data: { widgets }
  });
});

module.exports = {
  getDashboardOverview,
  getDashboardStats,
  getTimeTrackingDashboard,
  getProjectsDashboard,
  getClientsDashboard,
  getBillingDashboard,
  getTeamDashboard,
  getProductivityReport,
  getTimeSummaryReport,
  getProjectProgressReport,
  getTimeDistributionChart,
  getProjectHoursChart,
  getRevenueTrendChart,
  getTeamPerformanceChart,
  getRecentActivity,
  getDashboardNotifications,
  getQuickActions,
  getDashboardWidgets,
  updateDashboardWidgets,
  getTimeReport
};
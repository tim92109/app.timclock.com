/**
 * Demo-user seed for development.
 *
 * Creates the accounts advertised on the login screen:
 *   admin    / <SEED_ADMIN_PASSWORD or admin123>       (role: admin)
 *   manager  / <SEED_MANAGER_PASSWORD or manager123>   (role: manager)
 *   employee / <SEED_EMPLOYEE_PASSWORD or employee123> (role: employee)
 *
 * Existing accounts are never modified: a user is skipped when a row with the
 * same username or email already exists. Passwords are hashed at runtime with
 * the configured bcrypt cost. Dev-only fallback passwords are public, so this
 * script refuses to run against NODE_ENV=production unless --force is passed.
 *
 * Usage: npm run seed-users            (from the scripts/ directory)
 *        node seed-users.js --force    (only for an explicitly intended run)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const { executeQuery, closePool } = require('./config/database');
const { authConfig } = require('./config/auth');

const DEMO_USERS = [
  { username: 'admin', email: 'admin@timeclock.com', password: process.env.SEED_ADMIN_PASSWORD || 'admin123', first_name: 'Admin', last_name: 'User', role: 'admin' },
  { username: 'manager', email: 'manager@timeclock.com', password: process.env.SEED_MANAGER_PASSWORD || 'manager123', first_name: 'Manager', last_name: 'User', role: 'manager' },
  { username: 'employee', email: 'employee@timeclock.com', password: process.env.SEED_EMPLOYEE_PASSWORD || 'employee123', first_name: 'Employee', last_name: 'User', role: 'employee' },
];

const seedUsers = async () => {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
    console.error('❌ Refusing to seed demo users while NODE_ENV=production. Re-run with --force only if this is intentional.');
    process.exitCode = 1;
    return;
  }

  const saltRounds = authConfig.password.bcryptRounds;

  for (const user of DEMO_USERS) {
    const existing = await executeQuery(
      'SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1',
      [user.username, user.email]
    );

    if (existing.length > 0) {
      console.log(`⏭️  Skipped existing user: ${user.username}`);
      continue;
    }

    const password_hash = await bcrypt.hash(user.password, saltRounds);

    await executeQuery(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW(), NOW())`,
      [user.username, user.email, password_hash, user.first_name, user.last_name, user.role]
    );

    console.log(`✅ Seeded user: ${user.username} (${user.role})`);
  }

  console.log(`\nDemo-user seed finished (bcrypt cost ${saltRounds}).`);
};

seedUsers()
  .catch((error) => {
    console.error('❌ Failed to seed demo users:', error.message);
    process.exitCode = 1;
  })
  .finally(() => closePool());

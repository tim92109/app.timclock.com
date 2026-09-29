/**
 * SQL migration runner.
 *
 * Applies every .sql file in ./migrations in filename order against the
 * configured database. Migrations are written to be idempotent, so this is
 * safe to run repeatedly.
 *
 * Usage: node migrate.js   (from the scripts/ directory)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const getMigrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
};

/**
 * Run all migrations on an existing connection.
 * @param {import('mysql2/promise').Connection} connection
 */
const runMigrations = async (connection) => {
  const files = getMigrationFiles();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await connection.query(sql);
    console.log(`✅ Applied migration: ${file}`);
  }

  return files.length;
};

const main = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'timeclock_db',
    multipleStatements: true,
  });

  try {
    const count = await runMigrations(connection);
    console.log(`\nApplied ${count} migration file(s).`);
  } finally {
    await connection.end();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  });
}

module.exports = { runMigrations, getMigrationFiles };
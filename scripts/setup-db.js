/**
 * Cross-platform database setup.
 *
 * Creates the database and base tables from setup-database.sql, then applies
 * the idempotent migrations in ./migrations. It does NOT seed any users; run
 * `npm run seed-users` explicitly for development demo accounts. Because
 * setup-database.sql issues CREATE DATABASE / USE, the connection is opened
 * without selecting a database first.
 *
 * Usage: node setup-db.js   (from the scripts/ directory)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mysql = require('mysql2/promise');
const { runMigrations } = require('./migrate');

const setupDatabase = async () => {
  const sqlPath = path.join(__dirname, 'setup-database.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    await connection.query(sql);
    console.log(`✅ Applied ${path.basename(sqlPath)} to ${process.env.DB_HOST}:${process.env.DB_PORT}`);

    const count = await runMigrations(connection);
    console.log(`\nDatabase setup complete (${count} migration file(s) applied).`);
  } finally {
    await connection.end();
  }
};

setupDatabase().catch((error) => {
  console.error('❌ Database setup failed:', error.message);
  process.exit(1);
});
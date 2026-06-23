/**
 * Database Configuration
 * MySQL connection setup and management
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'timeclock_db',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+00:00'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

/**
 * Execute query with error handling
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
const executeQuery = async (query, params = []) => {
  try {
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  }
};

/**
 * Execute transaction
 * @param {Function} callback - Transaction callback function
 * @returns {Promise} Transaction result
 */
const executeTransaction = async (callback) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Get database statistics
 */
const getStats = async () => {
  try {
    const stats = await pool.execute('SHOW STATUS LIKE "Threads_connected"');
    return {
      activeConnections: stats[0][0]?.Value || 0,
      poolConfig: {
        connectionLimit: dbConfig.connectionLimit,
        queueLimit: dbConfig.queueLimit
      }
    };
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    return null;
  }
};

/**
 * Close database connection pool
 */
const closePool = async () => {
  try {
    await pool.end();
    console.log('Database connection pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
  }
};

module.exports = {
  pool,
  testConnection,
  executeQuery,
  executeTransaction,
  getStats,
  closePool
};

module.exports = {
  pool,
  testConnection,
  executeQuery,
  executeTransaction,
  getStats,
  closePool
};
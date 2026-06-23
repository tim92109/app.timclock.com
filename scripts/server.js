/**
 * TimeClock API Server
 * Main server file that initializes and starts the Express application
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
// Load environment variables
// Load .env first to get NODE_ENV, then load the appropriate environment file
require('dotenv').config({ path: path.join(__dirname, '.env') });
const envPath = process.env.NODE_ENV === 'development'
  ? path.join(__dirname, '.env.development')
  : undefined;
if (envPath) {
  require('dotenv').config({ path: envPath, override: true });
}

// Import middleware
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const projectRoutes = require('./routes/projects');
const timeEntryRoutes = require('./routes/timeEntries');
const billingRoutes = require('./routes/billing');
const dashboardRoutes = require('./routes/dashboard');

// Import database connection
const db = require('./config/database');

// Initialize Express app
const app = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3001', 'http://localhost:3000', 'https://app.timclock.com', 'http://app.timclock.com'];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ 
  limit: process.env.JSON_LIMIT || '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({
        success: false,
        error: 'Invalid JSON format',
        code: 'INVALID_JSON'
      });
      return;
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: process.env.URL_ENCODED_LIMIT || '10mb' 
}));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.executeQuery('SELECT 1');
    
    res.status(200).json({
      success: true,
      message: 'Server is healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Server is unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint for API
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await db.executeQuery('SELECT 1');
    
    res.status(200).json({
      status: 'ok',
      success: true,
      message: 'Server is healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      success: false,
      message: 'Server is unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/time', timeEntryRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/dashboard', dashboardRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'TimeClock API Server',
    version: process.env.npm_package_version || '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      clients: '/api/clients',
      projects: '/api/projects',
      timeEntries: '/api/time-entries',
      billing: '/api/billing',
      dashboard: '/api/dashboard'
    },
    health: '/health'
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  // Serve the built frontend from the dist directory
  app.use(express.static(path.join(__dirname, '..', 'public_html', 'dist')));
  
  // Catch all handler for SPA (except API routes)
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(__dirname, '..', 'public_html', 'dist', 'index.html'));
  });
}

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(globalErrorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  try {
    // Close database connections
    await db.closePool();
    console.log('Database connections closed');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  try {
    // Close database connections
    await db.closePool();
    console.log('Database connections closed');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, HOST, () => {
  console.log('🚀 TimeClock API Server Started');
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`📍 Server running at: http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
  console.log(`📚 API Documentation: http://${HOST}:${PORT}/api`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('🔗 Available API Endpoints:');
  console.log(`   • Authentication: http://${HOST}:${PORT}/api/auth`);
  console.log(`   • Clients: http://${HOST}:${PORT}/api/clients`);
  console.log(`   • Projects: http://${HOST}:${PORT}/api/projects`);
  console.log(`   • Time Entries: http://${HOST}:${PORT}/api/time-entries`);
  console.log(`   • Billing: http://${HOST}:${PORT}/api/billing`);
  console.log(`   • Dashboard: http://${HOST}:${PORT}/api/dashboard`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('✅ Server is ready to accept connections');
});

// Export server for testing
module.exports = server;
/**
 * PM2 Ecosystem Configuration
 * Production deployment configuration for TimeClock API Server
 */

module.exports = {
  apps: [
    {
      name: 'timeclock-api',
      script: './server.js',
      instances: 1, // Single instance for now
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOST: 'localhost'
      },
      
      // Production environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '0.0.0.0'
      },
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Auto restart configuration
      watch: true, // Set to true for development
      ignore_watch: [
        'node_modules',
        'logs',
        '*.log'
      ],
      
      // Memory and CPU limits
      max_memory_restart: '1G',
      
      // Restart configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Advanced features
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Health monitoring
      health_check_grace_period: 3000,
      
      // Merge logs from all instances
      merge_logs: true,
      
      // Time zone
      time: true,
      
      // Source map support
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID',
      
      // Graceful shutdown
      shutdown_with_message: true
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/timeclock-api.git',
      path: '/var/www/timeclock-api',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y'
    },
    
    staging: {
      user: 'deploy',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/timeclock-api.git',
      path: '/var/www/timeclock-api-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging'
    }
  }
};
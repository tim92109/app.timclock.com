# TimClock API Server

A comprehensive Node.js backend API server for time tracking, project management, client management, and billing operations.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control (Admin, Manager, Employee)
- **Client Management**: Complete CRUD operations for client management
- **Project Management**: Project creation, assignment, status tracking, and templates
- **Time Tracking**: Clock in/out functionality, manual time entries, and comprehensive time management
- **Billing System**: Invoice generation, payment tracking, and financial reporting
- **Dashboard Analytics**: Role-based dashboards with charts, reports, and real-time data
- **Security**: Helmet security headers, CORS protection, rate limiting, and input validation
- **Database**: MySQL integration with connection pooling and transaction support

## Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: express-validator
- **Password Hashing**: bcrypt
- **Process Management**: PM2
- **Environment**: dotenv

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd timeclock-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your configuration:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=timeclock_db
   DB_USER=your_username
   DB_PASSWORD=your_password
   
   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key
   JWT_EXPIRES_IN=7d
   
   # Server Configuration
   PORT=3000
   HOST=localhost
   NODE_ENV=development
   ```

4. **Database Setup**
   
   **Option A: Automated Setup (Recommended)**
   ```bash
   # For Windows
   npm run setup-db
   
   # For Linux/Mac
   npm run setup-db-unix
   ```
   
   **Option B: Manual Setup**
   - Navigate to `assets/DB/` directory
   - Run the setup script for your platform:
     - Windows: `setup-database.bat`
     - Linux/Mac: `./setup-database.sh`
   
   The setup script will create the database `timeclock_db`, user `timeclock_user`, and import all necessary SQL files.

5. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/change-password` - Change password

### Clients
- `GET /api/clients` - Get all clients
- `GET /api/clients/:id` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/:id` - Get project by ID
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/assign` - Assign user to project

### Time Entries
- `GET /api/time` - Get all time entries
- `POST /api/time/clock-in` - Clock in
- `POST /api/time/clock-out` - Clock out
- `GET /api/time/active` - Get current active entry
- `POST /api/time` - Create manual time entry

### Billing
- `GET /api/billing/invoices` - Get all invoices
- `POST /api/billing/invoices/generate` - Generate invoice
- `GET /api/billing/invoices/:id/pdf` - Download invoice PDF
- `POST /api/billing/invoices/:id/payment` - Record payment

### Dashboard
- `GET /api/dashboard/overview` - Dashboard overview
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/charts/time-distribution` - Time distribution chart

## Role-Based Access Control

### Admin
- Full access to all endpoints
- User management
- System configuration
- All reports and analytics

### Manager
- Client and project management
- Team time tracking oversight
- Billing and invoicing
- Team reports and analytics

### Employee
- Personal time tracking
- Assigned project access
- Personal reports and statistics

## Development

### Scripts
```bash
npm run dev          # Start development server with nodemon
npm start            # Start production server
npm run test         # Run tests
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
```

### Project Structure
```
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── routes/          # API routes
├── utils/           # Utility functions
├── logs/            # Application logs
├── server.js        # Main server file
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## Production Deployment

### Using PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start ecosystem.config.js --env production

# Monitor application
pm2 monit

# View logs
pm2 logs timeclock-api

# Restart application
pm2 restart timeclock-api
```

### Environment Variables
Production DB/JWT/session values are supplied by the host/pm2 environment, not
by a committed `.env` file. Export `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASSWORD`, `JWT_SECRET`, `SESSION_SECRET`, and `ALLOWED_ORIGINS` on the
server before starting with PM2; the `env_production` block in
`ecosystem.config.js` passes them through by name. Rotate all DB/JWT/session
secrets before deploy and never reuse the development demo passwords.

Also ensure these are set in production:
- Database credentials
- JWT secret (use a strong, unique secret)
- CORS allowed origins
- Rate limiting configuration

### Demo Users (development only)
`npm run seed-users` creates the demo accounts advertised on the login screen.
It sources passwords from `SEED_ADMIN_PASSWORD`, `SEED_MANAGER_PASSWORD`, and
`SEED_EMPLOYEE_PASSWORD` (falling back to the dev-only defaults), skips accounts
that already exist, and refuses to run while `NODE_ENV=production` unless
`--force` is passed. Production accounts must be provisioned through the
application's registration/admin flows instead.

## Security Features

- **Helmet**: Security headers protection
- **CORS**: Cross-origin resource sharing configuration
- **Rate Limiting**: Request rate limiting per IP
- **Input Validation**: Comprehensive input validation
- **Password Hashing**: bcrypt password hashing
- **JWT Authentication**: Secure token-based authentication

## Database Schema

The application uses MySQL with the following main tables:
- `users` - User accounts and authentication
- `clients` - Client information
- `projects` - Project management
- `time_entries` - Time tracking records
- `invoices` - Billing and invoicing
- `tasks` - Project tasks
- `project_templates` - Reusable project templates
- `payments` - Invoice payments
- `billing_rates` - Billing rate definitions

## Health Check

The server provides a health check endpoint:
- `GET /health` - Returns server status and database connectivity

## Logging

Application logs are stored in the `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only
- `out.log` - Standard output logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please contact the development team or create an issue in the repository.
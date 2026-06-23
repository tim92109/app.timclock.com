# TimeClock Frontend Application

A modern ReactJS frontend application for the TimeClock time tracking system. This application provides a comprehensive interface for managing time tracking, projects, clients, and billing.

## Features

### 🔐 Authentication & User Management
- **Login/Register**: Secure authentication with JWT tokens
- **Profile Management**: Update personal information and change passwords
- **Role-based Access**: Different interfaces for Admin, Manager, and Employee roles
- **Auto Token Refresh**: Seamless session management

### 📊 Dashboard
- **Overview Widgets**: Quick stats on hours, projects, and revenue
- **Active Timer Display**: Real-time timer with elapsed time
- **Recent Activity**: Latest time entries and project updates
- **Upcoming Deadlines**: Project deadline notifications
- **Quick Actions**: Fast access to common tasks

### ⏱️ Time Tracking
- **Real-time Timer**: Start/stop timer with live updates
- **Manual Entry**: Add time entries manually with date/time selection
- **Time Entry Management**: Edit and delete existing entries
- **Project Association**: Link time entries to specific projects
- **Export Functionality**: Download time reports
- **Filtering**: Filter entries by date, project, and client

### 📁 Project Management
- **Project CRUD**: Create, read, update, and delete projects
- **Status Workflow**: Track projects through different statuses (Active, On Hold, Completed, Cancelled)
- **Priority Management**: Set and manage project priorities
- **Budget Tracking**: Monitor project budgets and spending
- **Task Management**: Create and manage project tasks
- **Progress Visualization**: Visual progress bars and completion tracking
- **Deadline Management**: Set and track project deadlines

### 👥 Client Management
- **Client Profiles**: Comprehensive client information management
- **Contact Information**: Store emails, phones, addresses
- **Project History**: View all projects for each client
- **Revenue Tracking**: Monitor total revenue per client
- **Time Entry Overview**: See all time logged for each client
- **Invoice History**: Track billing and payment history

### 💰 Billing & Invoicing
- **Invoice Creation**: Generate invoices from time entries
- **Multiple Statuses**: Draft, Sent, Paid, Overdue tracking
- **Client Association**: Link invoices to specific clients and projects
- **Payment Tracking**: Mark invoices as paid
- **Invoice Export**: Download invoices as PDF
- **Revenue Analytics**: Track total revenue and pending payments
- **Overdue Notifications**: Identify overdue invoices

## Technology Stack

### Core Technologies
- **React 18**: Modern React with hooks and functional components
- **Vite**: Fast build tool and development server
- **React Router DOM**: Client-side routing
- **React Query**: Server state management and caching
- **React Hook Form**: Form handling and validation
- **Axios**: HTTP client with interceptors

### UI & Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Modern icon library
- **React Hot Toast**: Toast notifications
- **Custom Design System**: Professional blue/green color scheme

### Utilities
- **Date-fns**: Date manipulation and formatting
- **JWT Decode**: Token parsing and validation

## Project Structure

```
src/
├── components/
│   ├── Auth/
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   └── Profile.jsx
│   ├── Dashboard/
│   │   └── Dashboard.jsx
│   ├── TimeTracking/
│   │   └── TimeTracking.jsx
│   ├── Projects/
│   │   ├── Projects.jsx
│   │   └── ProjectDetail.jsx
│   ├── Clients/
│   │   ├── Clients.jsx
│   │   └── ClientDetail.jsx
│   ├── Billing/
│   │   └── Billing.jsx
│   ├── Layout/
│   │   └── Layout.jsx
│   └── Common/
│       ├── LoadingSpinner.jsx
│       ├── ErrorMessage.jsx
│       └── Modal.jsx
├── hooks/
│   └── useAuth.js
├── services/
│   └── api.js
├── utils/
│   ├── constants.js
│   └── helpers.js
├── App.jsx
└── main.jsx
```

## Key Components

### Authentication System
- **JWT Token Management**: Automatic token refresh and storage
- **Protected Routes**: Route guards based on authentication status
- **Role-based Navigation**: Different menu items based on user role
- **Session Persistence**: Maintain login state across browser sessions

### API Integration
- **Axios Configuration**: Base URL and interceptors setup
- **Error Handling**: Centralized error handling with user feedback
- **Request/Response Interceptors**: Automatic token attachment and refresh
- **Query Caching**: Efficient data fetching with React Query

### State Management
- **React Query**: Server state management with caching and synchronization
- **Context API**: Authentication state management
- **Local State**: Component-level state with React hooks
- **Form State**: React Hook Form for complex form handling

### UI/UX Features
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Loading States**: Skeleton screens and spinners
- **Error Boundaries**: Graceful error handling
- **Toast Notifications**: User feedback for actions
- **Modal System**: Reusable modal components
- **Form Validation**: Real-time validation with error messages

## API Endpoints Integration

The frontend integrates with the following backend endpoints:

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - User logout
- `POST /auth/refresh` - Token refresh
- `GET /auth/profile` - Get user profile
- `PUT /auth/profile` - Update user profile
- `POST /auth/change-password` - Change password

### Dashboard
- `GET /dashboard` - Dashboard statistics and data

### Time Tracking
- `GET /time` - Get time entries
- `POST /time` - Create time entry
- `PUT /time/:id` - Update time entry
- `DELETE /time/:id` - Delete time entry
- `POST /time/start` - Start timer
- `POST /time/stop` - Stop timer
- `GET /time/active` - Get active timer
- `GET /time/export` - Export time entries

### Projects
- `GET /projects` - Get projects
- `POST /projects` - Create project
- `GET /projects/:id` - Get project details
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project
- `GET /projects/:id/tasks` - Get project tasks
- `POST /projects/:id/tasks` - Create project task

### Clients
- `GET /clients` - Get clients
- `POST /clients` - Create client
- `GET /clients/:id` - Get client details
- `PUT /clients/:id` - Update client
- `DELETE /clients/:id` - Delete client
- `GET /clients/:id/projects` - Get client projects
- `GET /clients/:id/time` - Get client time entries

### Billing
- `GET /billing/invoices` - Get invoices
- `POST /billing/invoices` - Create invoice
- `GET /billing/invoices/:id` - Get invoice details
- `PUT /billing/invoices/:id` - Update invoice
- `DELETE /billing/invoices/:id` - Delete invoice
- `POST /billing/invoices/:id/send` - Send invoice
- `POST /billing/invoices/:id/mark-paid` - Mark invoice as paid
- `GET /billing/summary` - Get billing summary

## Development Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Build for Production**
   ```bash
   npm run build
   ```

4. **Preview Production Build**
   ```bash
   npm run preview
   ```

## Environment Configuration

The application expects the backend API to be available at `/api` (configured in Vite proxy settings). The backend should be running on the same domain or properly configured for CORS.

## Features by User Role

### Employee
- View personal dashboard
- Track time with timer
- View assigned projects
- Manage personal time entries
- Update profile

### Manager
- All employee features
- Manage all projects
- View all clients
- Access billing and invoicing
- View team time entries
- Generate reports

### Admin
- All manager features
- User management
- System configuration
- Full access to all data
- Advanced reporting

## Security Features

- **JWT Authentication**: Secure token-based authentication
- **Automatic Token Refresh**: Seamless session management
- **Role-based Access Control**: Different permissions by user role
- **Protected Routes**: Client-side route protection
- **Input Validation**: Form validation and sanitization
- **HTTPS Ready**: Secure communication with backend

## Performance Optimizations

- **Code Splitting**: Lazy loading of components
- **Query Caching**: Efficient data fetching with React Query
- **Optimistic Updates**: Immediate UI updates with rollback
- **Debounced Search**: Efficient search functionality
- **Memoization**: Optimized re-renders with React.memo
- **Bundle Optimization**: Tree shaking and minification

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Deployment

The application is built as a static SPA and can be deployed to any web server. The build output is in the `dist/` directory after running `npm run build`.

## Contributing

1. Follow the existing code structure and naming conventions
2. Use TypeScript-style JSDoc comments for better documentation
3. Implement proper error handling and loading states
4. Ensure responsive design for all new components
5. Add appropriate validation for all forms
6. Test thoroughly across different user roles

## License

This project is part of the TimeClock application suite.
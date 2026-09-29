import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
const getToken = () => localStorage.getItem('timeclock_token');
const setToken = (token) => localStorage.setItem('timeclock_token', token);
const removeToken = () => localStorage.removeItem('timeclock_token');
const getRefreshToken = () => localStorage.getItem('timeclock_refresh_token');
const setRefreshToken = (token) => localStorage.setItem('timeclock_refresh_token', token);
const removeRefreshToken = () => localStorage.removeItem('timeclock_refresh_token');

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh and unwrap data
api.interceptors.response.use(
  (response) => {
    // Unwrap backend response format { status: 'success', data: { ... } }
    if (response.data && response.data.status === 'success' && response.data.data !== undefined) {
      response.data = response.data.data;
    }
    // Flatten paginated responses { data: [...], pagination: {...} } -> [...]
    if (response.data && Array.isArray(response.data.data) && response.data.pagination) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const requestUrl = originalRequest.url || '';

    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = getRefreshToken();

      if (refreshToken) {
        try {
          const response = await axios.post('/api/auth/refresh', {
            refreshToken,
          });

          // The backend wraps its payload as { status, data: { tokens } }.
          // Refresh uses raw axios, so it bypasses the response unwrap above.
          const tokens = response.data?.data?.tokens || response.data?.tokens;

          if (!tokens?.accessToken) {
            throw new Error('Invalid refresh response');
          }

          setToken(tokens.accessToken);
          setRefreshToken(tokens.refreshToken);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, redirect to login
          removeToken();
          removeRefreshToken();
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        }
      }
    }

    // Expected 401s from the logged-out session probe (/auth/verify) are not
    // user-facing errors, so they are not toasted.
    const isSilentAuthProbe = requestUrl.includes('/auth/verify');

    if (!isSilentAuthProbe) {
      if (error.response?.data?.message) {
        toast.error(error.response.data.message);
      } else if (error.message) {
        toast.error(error.message);
      } else {
        toast.error('An unexpected error occurred');
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  verifyToken: () => api.get('/auth/verify'),
};

// Dashboard API
export const dashboardAPI = {
  getOverview: () => api.get('/dashboard/overview'),
  getTimeReport: (params) => api.get('/dashboard/time-report', { params }),
};

// Clients API
export const clientsAPI = {
  getClients: (params) => api.get('/clients', { params }),
  getClient: (id) => api.get(`/clients/${id}`),
  createClient: (data) => api.post('/clients', data),
  updateClient: (id, data) => api.put(`/clients/${id}`, data),
  deleteClient: (id) => api.delete(`/clients/${id}`),
  getClientStats: (id) => api.get(`/clients/${id}/stats`),
};

// Projects API
export const projectsAPI = {
  getProjects: (params) => api.get('/projects', { params }),
  getProject: (id) => api.get(`/projects/${id}`),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put(`/projects/${id}`, data),
  deleteProject: (id) => api.delete(`/projects/${id}`),
  getProjectTemplates: () => api.get('/projects/templates'),
};

// Time Tracking API
export const timeAPI = {
  getTimeEntries: (params) => api.get('/time', { params }),
  getTimeEntry: (id) => api.get(`/time/${id}`),
  createTimeEntry: (data) => api.post('/time', data),
  updateTimeEntry: (id, data) => api.put(`/time/${id}`, data),
  deleteTimeEntry: (id) => api.delete(`/time/${id}`),
  clockIn: (data) => api.post('/time/clock-in', data),
  clockOut: () => api.post('/time/clock-out'),
  getActiveEntry: () => api.get('/time/active'),
};

// Billing API
export const billingAPI = {
  getInvoices: (params) => api.get('/billing/invoices', { params }),
  getInvoice: (id) => api.get(`/billing/invoices/${id}`),
  createInvoice: (data) => api.post('/billing/invoices', data),
  updateInvoice: (id, data) => api.put(`/billing/invoices/${id}`, data),
  deleteInvoice: (id) => api.delete(`/billing/invoices/${id}`),
  sendInvoice: (id) => api.post(`/billing/invoices/${id}/send`),
  markInvoicePaid: (id) => api.post(`/billing/invoices/${id}/mark-paid`),
  getBillableProjects: () => api.get('/billing/billable-projects'),
  generateInvoiceFromProject: (projectId) => api.post(`/billing/generate-invoice/${projectId}`),
};

// Export token management functions
export const tokenManager = {
  getToken,
  setToken,
  removeToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
};

export { api };
export default api;
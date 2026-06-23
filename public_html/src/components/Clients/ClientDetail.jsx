import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building,
  FolderOpen,
  Clock,
  DollarSign,
  Calendar,
  Edit,
  Eye
} from 'lucide-react';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatDuration } from '../../utils/helpers';
import { STATUS_CONFIG } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';

const ClientDetail = () => {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch client details
  const { data: client, isLoading, error } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get(`/clients/${id}`).then(res => res.data),
  });

  // Fetch client projects
  const { data: projects } = useQuery({
    queryKey: ['client-projects', id],
    queryFn: () => api.get(`/clients/${id}/projects`).then(res => res.data),
  });

  // Fetch client time entries
  const { data: timeEntries } = useQuery({
    queryKey: ['client-time-entries', id],
    queryFn: () => api.get(`/clients/${id}/time`).then(res => res.data),
  });

  // Fetch client invoices
  const { data: invoices } = useQuery({
    queryKey: ['client-invoices', id],
    queryFn: () => api.get(`/clients/${id}/invoices`).then(res => res.data),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message="Failed to load client details" />;
  }

  const totalHours = timeEntries?.reduce((sum, entry) => sum + entry.duration, 0) || 0;
  const totalRevenue = invoices?.reduce((sum, invoice) => sum + invoice.amount, 0) || 0;
  const activeProjects = projects?.filter(project => project.status === 'active').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/clients"
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{client.name}</h1>
            {client.company && (
              <p className="text-gray-600 flex items-center mt-1">
                <Building className="w-4 h-4 mr-1" />
                {client.company}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to={`/clients/${id}/edit`}
            className="btn-outline btn-md flex items-center"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Client
          </Link>
        </div>
      </div>

      {/* Client Info Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Contact Information</h3>
            {client.email && (
              <div className="flex items-center text-sm text-gray-600">
                <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                <a 
                  href={`mailto:${client.email}`}
                  className="hover:text-primary-600 truncate"
                >
                  {client.email}
                </a>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center text-sm text-gray-600">
                <Phone className="w-4 h-4 mr-2 flex-shrink-0" />
                <a 
                  href={`tel:${client.phone}`}
                  className="hover:text-primary-600"
                >
                  {client.phone}
                </a>
              </div>
            )}
            {client.address && (
              <div className="flex items-start text-sm text-gray-600">
                <MapPin className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                <span>{client.address}</span>
              </div>
            )}
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {projects?.length || 0}
            </div>
            <div className="text-sm text-gray-500">Total Projects</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatDuration(totalHours * 3600)}
            </div>
            <div className="text-sm text-gray-500">Total Hours</div>
          </div>

          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(totalRevenue)}
            </div>
            <div className="text-sm text-gray-500">Total Revenue</div>
          </div>
        </div>

        {client.notes && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Notes</h3>
            <p className="text-gray-600">{client.notes}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'projects'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Projects ({projects?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('time')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'time'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Time Entries
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'invoices'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Invoices ({invoices?.length || 0})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-primary-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <FolderOpen className="w-5 h-5 text-primary-600" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-primary-600">Active Projects</p>
                      <p className="text-lg font-bold text-primary-900">{activeProjects}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Clock className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-green-600">This Month</p>
                      <p className="text-lg font-bold text-green-900">
                        {formatDuration((timeEntries?.filter(entry => 
                          new Date(entry.start_time).getMonth() === new Date().getMonth()
                        ).reduce((sum, entry) => sum + entry.duration, 0) || 0) * 3600)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <DollarSign className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-600">Avg. Project Value</p>
                      <p className="text-lg font-bold text-blue-900">
                        {projects?.length > 0 
                          ? formatCurrency(totalRevenue / projects.length)
                          : formatCurrency(0)
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {timeEntries?.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex items-center space-x-3 p-3 bg-gray-50 flex rounded-lg">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <Clock className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">
                          {entry.project_name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {entry.task_description}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {formatDuration(entry.duration)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(entry.start_time, 'MMM d')}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {timeEntries?.length === 0 && (
                    <p className="text-gray-500 text-center py-4">No recent activity</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'projects' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects?.map((project) => {
                  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.active;
                  
                  return (
                    <div key={project.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{project.name}</h4>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor} mt-1`}>
                            {project.status}
                          </span>
                        </div>
                        <Link
                          to={`/projects/${project.id}`}
                          className="p-1 text-gray-400 hover:text-primary-600"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                      </div>
                      
                      <div className="space-y-2 text-sm text-gray-600">
                        {project.budget && (
                          <div className="flex items-center">
                            <DollarSign className="w-4 h-4 mr-1" />
                            Budget: {formatCurrency(project.budget)}
                          </div>
                        )}
                        {project.deadline && (
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-1" />
                            Due: {formatDate(project.deadline, 'MMM d, yyyy')}
                          </div>
                        )}
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatDuration((project.total_hours || 0) * 3600)} logged
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {projects?.length === 0 && (
                <div className="text-center py-8">
                  <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No projects yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'time' && (
            <div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 flex">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {timeEntries?.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(entry.start_time, 'MMM d, yyyy')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.project_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {entry.task_description}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDuration(entry.duration)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.user_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {timeEntries?.length === 0 && (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No time entries yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div>
              <div className="space-y-4">
                {invoices?.map((invoice) => (
                  <div key={invoice.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">
                          Invoice #{invoice.invoice_number}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {formatDate(invoice.created_at, 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(invoice.amount)}
                        </p>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          invoice.status === 'paid' 
                            ? 'bg-green-100 text-green-800'
                            : invoice.status === 'sent'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {invoice.status}
                        </span>
                      </div>
                    </div>
                    {invoice.due_date && (
                      <p className="text-sm text-gray-500 mt-2">
                        Due: {formatDate(invoice.due_date, 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {invoices?.length === 0 && (
                <div className="text-center py-8">
                  <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No invoices yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientDetail;
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  FolderOpen, 
  Plus, 
  Search, 
  Filter,
  Edit,
  Trash2,
  Eye,
  Calendar,
  DollarSign,
  Clock,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { PROJECT_STATUSES, PROJECT_PRIORITIES, STATUS_CONFIG } from '../../utils/constants';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const Projects = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    clientId: '',
    priority: '',
  });

  // Fetch projects
  const { data: projects, isLoading, error } = useQuery({
    queryKey: ['projects', searchTerm, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      return api.get(`/projects?${params.toString()}`).then(res => res.data);
    },
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(res => res.data),
  });

  // Add project mutation
  const addProjectMutation = useMutation({
    mutationFn: (data) => api.post('/projects', data),
    onSuccess: () => {
      toast.success('Project created successfully');
      queryClient.invalidateQueries(['projects']);
      setShowAddModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create project');
    },
  });

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/projects/${id}`, data),
    onSuccess: () => {
      toast.success('Project updated successfully');
      queryClient.invalidateQueries(['projects']);
      setShowEditModal(false);
      setEditingProject(null);
      resetEdit();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update project');
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      toast.success('Project deleted successfully');
      queryClient.invalidateQueries(['projects']);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete project');
    },
  });

  // Form for adding projects
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  // Form for editing projects
  const { 
    register: registerEdit, 
    handleSubmit: handleEditSubmit, 
    formState: { errors: editErrors }, 
    reset: resetEdit,
    setValue: setEditValue
  } = useForm();

  const handleAddProject = (data) => {
    addProjectMutation.mutate(data);
  };

  const handleEditProject = (data) => {
    updateProjectMutation.mutate({
      id: editingProject.id,
      data,
    });
  };

  const handleDeleteProject = (id) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteProjectMutation.mutate(id);
    }
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    setEditValue('name', project.name);
    setEditValue('description', project.description);
    setEditValue('client_id', project.client_id);
    setEditValue('status', project.status);
    setEditValue('priority', project.priority);
    setEditValue('budget', project.budget);
    setEditValue('hourly_rate', project.hourly_rate);
    setEditValue('deadline', project.deadline ? formatDate(project.deadline, 'yyyy-MM-dd') : '');
    setShowEditModal(true);
  };

  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.active;
  };

  const getPriorityConfig = (priority) => {
    const configs = {
      low: { bgColor: 'bg-gray-100', textColor: 'text-gray-800' },
      medium: { bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
      high: { bgColor: 'bg-orange-100', textColor: 'text-orange-800' },
      urgent: { bgColor: 'bg-red-100', textColor: 'text-red-800' },
    };
    return configs[priority] || configs.medium;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message="Failed to load projects" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="mt-2 text-gray-600">Manage your projects and track progress</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary btn-md flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="input"
            >
              <option value="">All Statuses</option>
              {Object.entries(PROJECT_STATUSES).map(([key, value]) => (
                <option key={key} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filters.clientId}
              onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
              className="input"
            >
              <option value="">All Clients</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects?.map((project) => {
          const statusConfig = getStatusConfig(project.status);
          const priorityConfig = getPriorityConfig(project.priority);
          
          return (
            <div key={project.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {project.client_name}
                    </p>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        {project.status}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityConfig.bgColor} ${priorityConfig.textColor}`}>
                        {project.priority}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Link
                      to={`/projects/${project.id}`}
                      className="p-2 text-gray-400 hover:text-gray-600"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => openEditModal(project)}
                      className="p-2 text-gray-400 hover:text-primary-600"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProject(project.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {project.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="space-y-2">
                  {project.budget && (
                    <div className="flex items-center text-sm text-gray-600">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Budget: {formatCurrency(project.budget)}
                    </div>
                  )}
                  
                  {project.hourly_rate && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      Rate: {formatCurrency(project.hourly_rate)}/hr
                    </div>
                  )}

                  {project.deadline && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2" />
                      Due: {formatDate(project.deadline, 'MMM d, yyyy')}
                    </div>
                  )}

                  <div className="flex items-center text-sm text-gray-600">
                    <User className="w-4 h-4 mr-2" />
                    Created: {formatDate(project.created_at, 'MMM d, yyyy')}
                  </div>
                </div>

                {/* Progress Bar */}
                {project.total_hours > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{project.total_hours}h logged</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary-600 h-2 rounded-full" 
                        style={{ 
                          width: project.budget 
                            ? `${Math.min((project.total_hours * (project.hourly_rate || 0) / project.budget) * 100, 100)}%`
                            : '0%'
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {projects?.length === 0 && (
        <div className="text-center py-12">
          <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects found</h3>
          <p className="text-gray-600 mb-4">Get started by creating your first project.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary btn-md flex items-center mx-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Project
          </button>
        </div>
      )}

      {/* Add Project Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Create New Project"
      >
        <form onSubmit={handleSubmit(handleAddProject)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              {...register('name', { required: 'Project name is required' })}
              type="text"
              className={`input ${errors.name ? 'border-red-300' : ''}`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              {...register('client_id', { required: 'Client is required' })}
              className={`input ${errors.client_id ? 'border-red-300' : ''}`}
            >
              <option value="">Select a client</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {errors.client_id && (
              <p className="mt-1 text-sm text-red-600">{errors.client_id.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                {...register('status')}
                className="input"
              >
                {Object.entries(PROJECT_STATUSES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                {...register('priority')}
                className="input"
              >
                {Object.entries(PROJECT_PRIORITIES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget
              </label>
              <input
                {...register('budget')}
                type="number"
                step="0.01"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate
              </label>
              <input
                {...register('hourly_rate')}
                type="number"
                step="0.01"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deadline
            </label>
            <input
              {...register('deadline')}
              type="date"
              className="input"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="btn-outline btn-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addProjectMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {addProjectMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Project"
      >
        <form onSubmit={handleEditSubmit(handleEditProject)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              {...registerEdit('name', { required: 'Project name is required' })}
              type="text"
              className={`input ${editErrors.name ? 'border-red-300' : ''}`}
            />
            {editErrors.name && (
              <p className="mt-1 text-sm text-red-600">{editErrors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              {...registerEdit('client_id', { required: 'Client is required' })}
              className={`input ${editErrors.client_id ? 'border-red-300' : ''}`}
            >
              <option value="">Select a client</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {editErrors.client_id && (
              <p className="mt-1 text-sm text-red-600">{editErrors.client_id.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              {...registerEdit('description')}
              rows={3}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                {...registerEdit('status')}
                className="input"
              >
                {Object.entries(PROJECT_STATUSES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                {...registerEdit('priority')}
                className="input"
              >
                {Object.entries(PROJECT_PRIORITIES).map(([key, value]) => (
                  <option key={key} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget
              </label>
              <input
                {...registerEdit('budget')}
                type="number"
                step="0.01"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hourly Rate
              </label>
              <input
                {...registerEdit('hourly_rate')}
                type="number"
                step="0.01"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deadline
            </label>
            <input
              {...registerEdit('deadline')}
              type="date"
              className="input"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="btn-outline btn-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateProjectMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {updateProjectMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                'Update Project'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Projects;
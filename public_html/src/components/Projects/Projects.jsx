import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  FolderOpen, 
  Plus, 
  Search, 
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
import { useSettings } from '../../hooks/useSettings.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { formatCurrency, formatDate, sanitizeForm } from '../../utils/helpers';
import { PROJECT_STATUSES, PROJECT_PRIORITIES, STATUS_CONFIG, USER_ROLES } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const Projects = () => {
  const { t } = useSettings();
  const { user } = useAuth();
  const canManage = [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.CONTRACTOR].includes(user?.role);
  const canAssignTeam = [USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(user?.role);
  const canDelete = user?.role === USER_ROLES.ADMIN;
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [editSelectedUserIds, setEditSelectedUserIds] = useState([]);
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

  // Fetch users for assignee dropdown
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data.users),
    enabled: canAssignTeam,
  });

  // Add project mutation
  const addProjectMutation = useMutation({
    mutationFn: (data) => api.post('/projects', data),
    onSuccess: () => {
      toast.success(t('projects.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowAddModal(false);
      setSelectedUserIds([]);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('projects.toast.createFailed'));
    },
  });

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/projects/${id}`, data),
    onSuccess: () => {
      toast.success(t('projects.toast.updated'));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowEditModal(false);
      setEditingProject(null);
      resetEdit();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('projects.toast.updateFailed'));
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (id) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      toast.success(t('projects.toast.deleted'));
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('projects.toast.deleteFailed'));
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

  // Drop empty optional fields and coerce numeric fields so the API's
// isFloat/isISO8601 validators do not reject empty form inputs.
  const sanitizeProject = (data, assignedUserIds) =>
    sanitizeForm(
      { ...data, assigned_user_ids: assignedUserIds },
      ['client_id', 'fixed_price', 'hourly_rate', 'estimated_hours']
    );

  const toggleUserSelection = (setter, userId) => {
    setter((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const openAddModal = () => {
    setSelectedUserIds([]);
    reset();
    setShowAddModal(true);
  };

  const handleAddProject = (data) => {
    addProjectMutation.mutate(sanitizeProject(data, selectedUserIds));
  };

  const handleEditProject = (data) => {
    updateProjectMutation.mutate({
      id: editingProject.id,
      data: sanitizeProject(data, editSelectedUserIds),
    });
  };

  const handleDeleteProject = (id) => {
    if (window.confirm(t('projects.confirm.deleteProject'))) {
      deleteProjectMutation.mutate(id);
    }
  };

  const openEditModal = (project) => {
    setEditingProject(project);
    setEditValue('name', project.name);
    setEditValue('description', project.description);
    setEditValue('client_id', project.client?.id || '');
    setEditValue('status', project.status);
    setEditValue('priority', project.priority);
    setEditValue('fixed_price', project.fixed_price);
    setEditValue('hourly_rate', project.hourly_rate);
    setEditSelectedUserIds(
      project.assigned_users?.map((u) => u.id) ??
        (project.assigned_user ? [project.assigned_user.id] : [])
    );
    setEditValue('due_date', project.due_date ? formatDate(project.due_date, 'yyyy-MM-dd') : '');
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
    return <ErrorMessage message={t('projects.error.load')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('projects.title')}</h1>
          <p className="mt-2 text-gray-600">{t('projects.subtitle')}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          {canManage && (
            <button
              onClick={openAddModal}
              className="btn-primary btn-md flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('projects.newProject')}
            </button>
          )}
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
                placeholder={t('projects.searchPlaceholder')}
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
              <option value="">{t('projects.allStatuses')}</option>
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
              <option value="">{t('projects.allClients')}</option>
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
          const assigneeNames =
            project.assigned_users?.map((u) => u.name) ??
            (project.assigned_user ? [project.assigned_user.name] : []);
          const visibleAssignees = assigneeNames.slice(0, 2);
          const extraAssignees = assigneeNames.length - visibleAssignees.length;
          
          return (
            <div key={project.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {project.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      {project.client?.name}
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
                    {canManage && (
                      <button
                        onClick={() => openEditModal(project)}
                        className="p-2 text-gray-400 hover:text-primary-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {project.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="space-y-2">
                  {project.fixed_price && (
                    <div className="flex items-center text-sm text-gray-600">
                      <DollarSign className="w-4 h-4 mr-2" />
                      {t('projects.fixedPrice')}: {formatCurrency(project.fixed_price)}
                    </div>
                  )}
                  
                  {project.hourly_rate && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      {t('projects.rate')}: {formatCurrency(project.hourly_rate)}{t('projects.perHour')}
                    </div>
                  )}

                  {project.due_date && (
                    <div className="flex items-center text-sm text-gray-600">
                      <Calendar className="w-4 h-4 mr-2" />
                      {t('projects.due')}: {formatDate(project.due_date, 'MMM d, yyyy')}
                    </div>
                  )}

                  <div className="flex items-center text-sm text-gray-600">
                    <User className="w-4 h-4 mr-2" />
                    {t('projects.created')}: {formatDate(project.created_at, 'MMM d, yyyy')}
                  </div>

                  {assigneeNames.length > 0 && (
                    <div
                      className="flex items-center text-sm text-gray-600"
                      title={
                        extraAssignees > 0
                          ? t('projects.assignedToMore').replace('{count}', String(extraAssignees))
                          : undefined
                      }
                    >
                      <User className="w-4 h-4 mr-2" />
                      {t('projects.assignedTo')}: {visibleAssignees.join(', ')}
                      {extraAssignees > 0 && ` +${extraAssignees}`}
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                {project.total_hours > 0 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{t('projects.progress')}</span>
                      <span>{project.total_hours}h {t('projects.logged')}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary-600 h-2 rounded-full" 
                        style={{ 
                          width: project.fixed_price 
                            ? `${Math.min((project.total_hours * (project.hourly_rate || 0) / project.fixed_price) * 100, 100)}%`
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
          {canManage ? (
            <>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('projects.empty.title')}</h3>
              <p className="text-gray-600 mb-4">{t('projects.empty.subtitle')}</p>
              <button
                onClick={openAddModal}
                className="btn-primary btn-md flex items-center mx-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('projects.createProject')}
              </button>
            </>
          ) : (
            <p className="text-gray-600">{t('projects.emptyEmployee')}</p>
          )}
        </div>
      )}

      {/* Add Project Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('projects.modal.createTitle')}
      >
        <form onSubmit={handleSubmit(handleAddProject)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('projects.form.name')}
            </label>
            <input
              {...register('name', { required: t('projects.validation.nameRequired') })}
              type="text"
              className={`input ${errors.name ? 'border-red-300' : ''}`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('projects.form.client')}
            </label>
            <select
              {...register('client_id', { required: t('projects.validation.clientRequired') })}
              className={`input ${errors.client_id ? 'border-red-300' : ''}`}
            >
              <option value="">{t('projects.form.selectClient')}</option>
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
              {t('projects.form.description')}
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
                {t('projects.form.status')}
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
                {t('projects.form.priority')}
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
                {t('projects.form.fixedPrice')}
              </label>
              <input
                {...register('fixed_price')}
                type="number"
                step="0.01"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('projects.form.hourlyRate')}
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
              {t('projects.form.deadline')}
            </label>
            <input
              {...register('due_date')}
              type="date"
              className="input"
            />
          </div>

          {canAssignTeam && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('projects.assignedTo')}
              </label>
              <p className="mb-2 text-xs text-gray-500">{t('projects.assigneesHint')}</p>
              {users?.length ? (
                <div className="max-h-40 overflow-y-auto rounded-md border border-gray-300 p-2 space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center space-x-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => toggleUserSelection(setSelectedUserIds, u.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{t('projects.noUsers')}</p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="btn-outline btn-md"
            >
              {t('projects.cancel')}
            </button>
            <button
              type="submit"
              disabled={addProjectMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {addProjectMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('projects.createProject')
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('projects.modal.editTitle')}
      >
        <form onSubmit={handleEditSubmit(handleEditProject)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('projects.form.name')}
            </label>
            <input
              {...registerEdit('name', { required: t('projects.validation.nameRequired') })}
              type="text"
              className={`input ${editErrors.name ? 'border-red-300' : ''}`}
            />
            {editErrors.name && (
              <p className="mt-1 text-sm text-red-600">{editErrors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('projects.form.client')}
            </label>
            <select
              {...registerEdit('client_id', { required: t('projects.validation.clientRequired') })}
              className={`input ${editErrors.client_id ? 'border-red-300' : ''}`}
            >
              <option value="">{t('projects.form.selectClient')}</option>
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
              {t('projects.form.description')}
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
                {t('projects.form.status')}
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
                {t('projects.form.priority')}
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
                {t('projects.form.fixedPrice')}
              </label>
              <input
                {...registerEdit('fixed_price')}
                type="number"
                step="0.01"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('projects.form.hourlyRate')}
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
              {t('projects.form.deadline')}
            </label>
            <input
              {...registerEdit('due_date')}
              type="date"
              className="input"
            />
          </div>

          {canAssignTeam && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('projects.assignedTo')}
              </label>
              <p className="mb-2 text-xs text-gray-500">{t('projects.assigneesHint')}</p>
              {users?.length ? (
                <div className="max-h-40 overflow-y-auto rounded-md border border-gray-300 p-2 space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center space-x-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={editSelectedUserIds.includes(u.id)}
                        onChange={() => toggleUserSelection(setEditSelectedUserIds, u.id)}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span>{[u.first_name, u.last_name].filter(Boolean).join(' ') || u.username}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{t('projects.noUsers')}</p>
              )}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="btn-outline btn-md"
            >
              {t('projects.cancel')}
            </button>
            <button
              type="submit"
              disabled={updateProjectMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {updateProjectMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('projects.updateProject')
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Projects;
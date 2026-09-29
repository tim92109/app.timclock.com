import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  Play, 
  Square, 
  Clock, 
  Download,
  Edit,
  Trash2,
  Plus
} from 'lucide-react';
import { api } from '../../services/api';
import { formatDuration, formatDate, formatDateTime, formatTimer } from '../../utils/helpers';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import { useSettings } from '../../hooks/useSettings.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { USER_ROLES } from '../../utils/constants';
import toast from 'react-hot-toast';

// Convert a <input type="datetime-local"> value (naive local time) into an absolute
// ISO 8601 instant so the API stores the intended moment regardless of the server's
// timezone. Without this, the server reads the wall-clock string as its own local
// time and entries shift by the server/viewer offset.
const toIsoTimestamp = (value) => (value ? new Date(value).toISOString() : value);

const TimeTracking = () => {
  const { t } = useSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: '',
    clientId: '',
  });

  const canManage = [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.CONTRACTOR].includes(user?.role);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch active time entry
  const { data: activeTimeEntry, refetch: refetchActiveEntry } = useQuery({
    queryKey: ['active-time-entry'],
    queryFn: () => api.get('/time/active').then(res => res.data.active_entry),
    refetchInterval: 30000,
  });

  // Fetch time entries
  const { data: timeEntries, isLoading, error } = useQuery({
    queryKey: ['time-entries', filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      return api.get(`/time?${params.toString()}`).then(res => res.data);
    },
  });

  // Fetch projects for dropdown
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(res => res.data),
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(res => res.data),
  });

  // Stop timer mutation
  const stopTimerMutation = useMutation({
    mutationFn: () => api.post('/time/clock-out'),
    onSuccess: () => {
      toast.success(t('time.toastTimerStopped'));
      refetchActiveEntry();
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('time.toastStopTimerFailed'));
    },
  });

  // Add time entry mutation
  const addTimeEntryMutation = useMutation({
    mutationFn: (data) => api.post('/time', data),
    onSuccess: () => {
      toast.success(t('time.toastEntryAdded'));
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      setShowAddModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('time.toastAddFailed'));
    },
  });

  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: (data) => api.post('/time/clock-in', data),
    onSuccess: () => {
      toast.success(t('time.timerStarted'));
      refetchActiveEntry();
      queryClient.invalidateQueries({ queryKey: ['active-time-entry'] });
      setShowStartModal(false);
      resetStart();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('time.startTimerFailed'));
    },
  });

  // Update time entry mutation
  const updateTimeEntryMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/time/${id}`, data),
    onSuccess: () => {
      toast.success(t('time.toastEntryUpdated'));
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      setShowEditModal(false);
      setEditingEntry(null);
      resetEdit();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('time.toastUpdateFailed'));
    },
  });

  // Delete time entry mutation
  const deleteTimeEntryMutation = useMutation({
    mutationFn: (id) => api.delete(`/time/${id}`),
    onSuccess: () => {
      toast.success(t('time.toastEntryDeleted'));
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('time.toastDeleteFailed'));
    },
  });

  // Form for adding time entries
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  // Form for starting a timer
  const { 
    register: registerStart, 
    handleSubmit: handleStartSubmit, 
    formState: { errors: startErrors }, 
    reset: resetStart 
  } = useForm();

  // Form for editing time entries
  const { 
    register: registerEdit, 
    handleSubmit: handleEditSubmit, 
    formState: { errors: editErrors }, 
    reset: resetEdit,
    setValue: setEditValue
  } = useForm();

  // Calculate elapsed time for active timer
  const getElapsedTime = () => {
    if (!activeTimeEntry?.start_time) return 0;
    const startTime = new Date(activeTimeEntry.start_time);
    return Math.floor((currentTime - startTime) / 1000);
  };

  const elapsedSeconds = getElapsedTime();

  const handleStopTimer = () => {
    stopTimerMutation.mutate();
  };

  const handleAddTimeEntry = (data) => {
    addTimeEntryMutation.mutate({
      ...data,
      start_time: toIsoTimestamp(data.start_time),
      end_time: toIsoTimestamp(data.end_time),
    });
  };

  const handleStartTimer = (data) => {
    startTimerMutation.mutate({
      project_id: Number(data.project_id),
      description: data.description,
    });
  };

  const handleEditTimeEntry = (data) => {
    updateTimeEntryMutation.mutate({
      id: editingEntry.id,
      data: {
        ...data,
        start_time: toIsoTimestamp(data.start_time),
        end_time: toIsoTimestamp(data.end_time),
      },
    });
  };

  const handleDeleteTimeEntry = (id) => {
    if (window.confirm(t('time.confirmDelete'))) {
      deleteTimeEntryMutation.mutate(id);
    }
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setEditValue('project_id', entry.project_id);
    setEditValue('description', entry.description);
    setEditValue('start_time', formatDateTime(entry.start_time, "yyyy-MM-dd'T'HH:mm"));
    setEditValue('end_time', entry.end_time ? formatDateTime(entry.end_time, "yyyy-MM-dd'T'HH:mm") : '');
    setShowEditModal(true);
  };

  const exportTimeEntries = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
    
    window.open(`/api/time/export?${params.toString()}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={t('time.loadError')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('time.title')}</h1>
          <p className="mt-2 text-gray-600">{t('time.subtitle')}</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-secondary btn-md flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('time.addEntry')}
          </button>
          {canManage && (
            <button
              onClick={exportTimeEntries}
              className="btn-outline btn-md flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('time.export')}
            </button>
          )}
        </div>
      </div>

      {/* Active Timer */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('time.currentTimer')}</h2>
        
        {activeTimeEntry ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-primary-100 rounded-full">
                <Clock className="w-6 h-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {activeTimeEntry.project_name}
                </h3>
                <p className="text-gray-600">{activeTimeEntry.description}</p>
                <p className="text-sm text-gray-500">
                  {t('time.startedAt')} {formatDateTime(activeTimeEntry.start_time, 'h:mm a')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-mono font-bold text-gray-900">
                {formatTimer(elapsedSeconds)}
              </div>
              <button
                onClick={handleStopTimer}
                disabled={stopTimerMutation.isPending}
                className="btn-danger btn-md flex items-center mt-2"
              >
                {stopTimerMutation.isPending ? (
                  <LoadingSpinner size="sm" color="white" />
                ) : (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    {t('time.stopTimer')}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">{t('time.noActiveTimer')}</p>
            <button
              onClick={() => setShowStartModal(true)}
              className="btn-primary btn-md flex items-center mx-auto"
            >
              <Play className="w-4 h-4 mr-2" />
              {t('time.startTimer')}
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('time.filters')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.startDate')}
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.endDate')}
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.project')}
            </label>
            <select
              value={filters.projectId}
              onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
              className="input"
            >
              <option value="">{t('time.allProjects')}</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.client')}
            </label>
            <select
              value={filters.clientId}
              onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
              className="input"
            >
              <option value="">{t('time.allClients')}</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Time Entries Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('time.timeEntries')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('time.date')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('time.project')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('time.task')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('time.duration')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('time.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {timeEntries?.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(entry.start_time, 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {entry.project?.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {entry.client?.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {entry.description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDuration(entry.duration_minutes)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openEditModal(entry)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTimeEntry(entry.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Start Timer Modal */}
      <Modal
        isOpen={showStartModal}
        onClose={() => setShowStartModal(false)}
        title={t('time.startTimerModalTitle')}
      >
        <form onSubmit={handleStartSubmit(handleStartTimer)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.startTimerProject')}
            </label>
            <select
              {...registerStart('project_id', { required: t('time.validationProjectRequired') })}
              className={`input ${startErrors.project_id ? 'border-red-300' : ''}`}
            >
              <option value="">{t('time.selectProject')}</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {startErrors.project_id && (
              <p className="mt-1 text-sm text-red-600">{startErrors.project_id.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.startTimerDescription')}
            </label>
            <textarea
              {...registerStart('description')}
              rows={3}
              className="input"
            />
          </div>

          {projects?.length === 0 && (
            <p className="text-sm text-gray-500">{t('time.noProjects')}</p>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowStartModal(false)}
              className="btn-outline btn-md"
            >
              {t('time.cancel')}
            </button>
            <button
              type="submit"
              disabled={startTimerMutation.isPending || projects?.length === 0}
              className="btn-primary btn-md flex items-center"
            >
              {startTimerMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('time.startTimerConfirm')
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Time Entry Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('time.addTimeEntry')}
      >
        <form onSubmit={handleSubmit(handleAddTimeEntry)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.project')}
            </label>
            <select
              {...register('project_id', { required: t('time.validationProjectRequired') })}
              className={`input ${errors.project_id ? 'border-red-300' : ''}`}
            >
              <option value="">{t('time.selectProject')}</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {errors.project_id && (
              <p className="mt-1 text-sm text-red-600">{errors.project_id.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.taskDescription')}
            </label>
            <textarea
              {...register('description', { required: t('time.validationDescriptionRequired') })}
              rows={3}
              className={`input ${errors.description ? 'border-red-300' : ''}`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('time.startTime')}
              </label>
              <input
                {...register('start_time', { required: t('time.validationStartTimeRequired') })}
                type="datetime-local"
                className={`input ${errors.start_time ? 'border-red-300' : ''}`}
              />
              {errors.start_time && (
                <p className="mt-1 text-sm text-red-600">{errors.start_time.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('time.endTime')}
              </label>
              <input
                {...register('end_time', { required: t('time.validationEndTimeRequired') })}
                type="datetime-local"
                className={`input ${errors.end_time ? 'border-red-300' : ''}`}
              />
              {errors.end_time && (
                <p className="mt-1 text-sm text-red-600">{errors.end_time.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="btn-outline btn-md"
            >
              {t('time.cancel')}
            </button>
            <button
              type="submit"
              disabled={addTimeEntryMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {addTimeEntryMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('time.addEntry')
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Time Entry Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('time.editTimeEntry')}
      >
        <form onSubmit={handleEditSubmit(handleEditTimeEntry)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.project')}
            </label>
            <select
              {...registerEdit('project_id', { required: t('time.validationProjectRequired') })}
              className={`input ${editErrors.project_id ? 'border-red-300' : ''}`}
            >
              <option value="">{t('time.selectProject')}</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            {editErrors.project_id && (
              <p className="mt-1 text-sm text-red-600">{editErrors.project_id.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('time.taskDescription')}
            </label>
            <textarea
              {...registerEdit('description', { required: t('time.validationDescriptionRequired') })}
              rows={3}
              className={`input ${editErrors.description ? 'border-red-300' : ''}`}
            />
            {editErrors.description && (
              <p className="mt-1 text-sm text-red-600">{editErrors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('time.startTime')}
              </label>
              <input
                {...registerEdit('start_time', { required: t('time.validationStartTimeRequired') })}
                type="datetime-local"
                className={`input ${editErrors.start_time ? 'border-red-300' : ''}`}
              />
              {editErrors.start_time && (
                <p className="mt-1 text-sm text-red-600">{editErrors.start_time.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('time.endTime')}
              </label>
              <input
                {...registerEdit('end_time', { required: t('time.validationEndTimeRequired') })}
                type="datetime-local"
                className={`input ${editErrors.end_time ? 'border-red-300' : ''}`}
              />
              {editErrors.end_time && (
                <p className="mt-1 text-sm text-red-600">{editErrors.end_time.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="btn-outline btn-md"
            >
              {t('time.cancel')}
            </button>
            <button
              type="submit"
              disabled={updateTimeEntryMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {updateTimeEntryMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('time.updateEntry')
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TimeTracking;
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  Play, 
  Pause, 
  Square, 
  Clock, 
  Calendar,
  Filter,
  Download,
  Edit,
  Trash2,
  Plus
} from 'lucide-react';
import { api } from '../../services/api';
import { formatDuration, formatDate, formatDateTime } from '../../utils/helpers';
import { useAuth } from '../../hooks/useAuth';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const TimeTracking = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: '',
    clientId: '',
  });

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
    queryFn: () => api.get('/time/active').then(res => res.data),
    refetchInterval: 1000,
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

  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: (data) => api.post('/time/start', data),
    onSuccess: () => {
      toast.success('Timer started successfully');
      refetchActiveEntry();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to start timer');
    },
  });

  // Stop timer mutation
  const stopTimerMutation = useMutation({
    mutationFn: () => api.post('/time/stop'),
    onSuccess: () => {
      toast.success('Timer stopped successfully');
      refetchActiveEntry();
      queryClient.invalidateQueries(['time-entries']);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to stop timer');
    },
  });

  // Add time entry mutation
  const addTimeEntryMutation = useMutation({
    mutationFn: (data) => api.post('/time', data),
    onSuccess: () => {
      toast.success('Time entry added successfully');
      queryClient.invalidateQueries(['time-entries']);
      setShowAddModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to add time entry');
    },
  });

  // Update time entry mutation
  const updateTimeEntryMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/time/${id}`, data),
    onSuccess: () => {
      toast.success('Time entry updated successfully');
      queryClient.invalidateQueries(['time-entries']);
      setShowEditModal(false);
      setEditingEntry(null);
      resetEdit();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update time entry');
    },
  });

  // Delete time entry mutation
  const deleteTimeEntryMutation = useMutation({
    mutationFn: (id) => api.delete(`/time/${id}`),
    onSuccess: () => {
      toast.success('Time entry deleted successfully');
      queryClient.invalidateQueries(['time-entries']);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete time entry');
    },
  });

  // Form for adding time entries
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

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

  const handleStartTimer = (data) => {
    startTimerMutation.mutate(data);
  };

  const handleStopTimer = () => {
    stopTimerMutation.mutate();
  };

  const handleAddTimeEntry = (data) => {
    addTimeEntryMutation.mutate(data);
  };

  const handleEditTimeEntry = (data) => {
    updateTimeEntryMutation.mutate({
      id: editingEntry.id,
      data,
    });
  };

  const handleDeleteTimeEntry = (id) => {
    if (window.confirm('Are you sure you want to delete this time entry?')) {
      deleteTimeEntryMutation.mutate(id);
    }
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setEditValue('project_id', entry.project_id);
    setEditValue('task_description', entry.task_description);
    setEditValue('start_time', formatDateTime(entry.start_time, "yyyy-MM-dd'T'HH:mm"));
    setEditValue('end_time', formatDateTime(entry.end_time, "yyyy-MM-dd'T'HH:mm"));
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
    return <ErrorMessage message="Failed to load time entries" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Time Tracking</h1>
          <p className="mt-2 text-gray-600">Track your time and manage entries</p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-secondary btn-md flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Entry
          </button>
          <button
            onClick={exportTimeEntries}
            className="btn-outline btn-md flex items-center"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Active Timer */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Timer</h2>
        
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
                <p className="text-gray-600">{activeTimeEntry.task_description}</p>
                <p className="text-sm text-gray-500">
                  Started at {formatDateTime(activeTimeEntry.start_time, 'h:mm a')}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-mono font-bold text-gray-900">
                {formatDuration(elapsedSeconds)}
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
                    Stop Timer
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No active timer</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary btn-md flex items-center mx-auto"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Timer
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
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
              End Date
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
              Project
            </label>
            <select
              value={filters.projectId}
              onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
              className="input"
            >
              <option value="">All Projects</option>
              {projects?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
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

      {/* Time Entries Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Time Entries</h3>
        </div>
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
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {timeEntries?.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50 hover:flex">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(entry.start_time, 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {entry.project_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {entry.client_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {entry.task_description}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDuration(entry.duration)}
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

      {/* Add Time Entry Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Time Entry"
      >
        <form onSubmit={handleSubmit(handleAddTimeEntry)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project
            </label>
            <select
              {...register('project_id', { required: 'Project is required' })}
              className={`input ${errors.project_id ? 'border-red-300' : ''}`}
            >
              <option value="">Select a project</option>
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
              Task Description
            </label>
            <textarea
              {...register('task_description', { required: 'Task description is required' })}
              rows={3}
              className={`input ${errors.task_description ? 'border-red-300' : ''}`}
            />
            {errors.task_description && (
              <p className="mt-1 text-sm text-red-600">{errors.task_description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                {...register('start_time', { required: 'Start time is required' })}
                type="datetime-local"
                className={`input ${errors.start_time ? 'border-red-300' : ''}`}
              />
              {errors.start_time && (
                <p className="mt-1 text-sm text-red-600">{errors.start_time.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                {...register('end_time', { required: 'End time is required' })}
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={addTimeEntryMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {addTimeEntryMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                'Add Entry'
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Time Entry Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Time Entry"
      >
        <form onSubmit={handleEditSubmit(handleEditTimeEntry)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project
            </label>
            <select
              {...registerEdit('project_id', { required: 'Project is required' })}
              className={`input ${editErrors.project_id ? 'border-red-300' : ''}`}
            >
              <option value="">Select a project</option>
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
              Task Description
            </label>
            <textarea
              {...registerEdit('task_description', { required: 'Task description is required' })}
              rows={3}
              className={`input ${editErrors.task_description ? 'border-red-300' : ''}`}
            />
            {editErrors.task_description && (
              <p className="mt-1 text-sm text-red-600">{editErrors.task_description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time
              </label>
              <input
                {...registerEdit('start_time', { required: 'Start time is required' })}
                type="datetime-local"
                className={`input ${editErrors.start_time ? 'border-red-300' : ''}`}
              />
              {editErrors.start_time && (
                <p className="mt-1 text-sm text-red-600">{editErrors.start_time.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time
              </label>
              <input
                {...registerEdit('end_time', { required: 'End time is required' })}
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateTimeEntryMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {updateTimeEntryMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                'Update Entry'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TimeTracking;
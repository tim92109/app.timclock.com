import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  ArrowLeft,
  Edit,
  Clock,
  DollarSign,
  Calendar,
  User,
  FileText,
  Plus,
  Play,
  Trash2,
  CheckSquare,
  Square
} from 'lucide-react';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatDuration } from '../../utils/helpers';
import { STATUS_CONFIG } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const ProjectDetail = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Fetch project details
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(res => res.data),
  });

  // Fetch project tasks
  const { data: tasks } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: () => api.get(`/projects/${id}/tasks`).then(res => res.data),
  });

  // Fetch project time entries
  const { data: timeEntries } = useQuery({
    queryKey: ['project-time-entries', id],
    queryFn: () => api.get(`/projects/${id}/time`).then(res => res.data),
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: (data) => api.post(`/projects/${id}/tasks`, data),
    onSuccess: () => {
      toast.success('Task added successfully');
      queryClient.invalidateQueries(['project-tasks', id]);
      setShowTaskModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to add task');
    },
  });

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }) => api.put(`/projects/${id}/tasks/${taskId}`, data),
    onSuccess: () => {
      toast.success('Task updated successfully');
      queryClient.invalidateQueries(['project-tasks', id]);
      setShowTaskModal(false);
      setEditingTask(null);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update task');
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId) => api.delete(`/projects/${id}/tasks/${taskId}`),
    onSuccess: () => {
      toast.success('Task deleted successfully');
      queryClient.invalidateQueries(['project-tasks', id]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete task');
    },
  });

  // Toggle task completion
  const toggleTaskMutation = useMutation({
    mutationFn: ({ taskId, completed }) => 
      api.put(`/projects/${id}/tasks/${taskId}`, { completed }),
    onSuccess: () => {
      queryClient.invalidateQueries(['project-tasks', id]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to update task');
    },
  });

  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: (data) => api.post('/time/start', { ...data, project_id: id }),
    onSuccess: () => {
      toast.success('Timer started successfully');
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to start timer');
    },
  });

  // Form for tasks
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();

  const handleAddTask = (data) => {
    if (editingTask) {
      updateTaskMutation.mutate({
        taskId: editingTask.id,
        data,
      });
    } else {
      addTaskMutation.mutate(data);
    }
  };

  const handleDeleteTask = (taskId) => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      deleteTaskMutation.mutate(taskId);
    }
  };

  const handleToggleTask = (taskId, completed) => {
    toggleTaskMutation.mutate({ taskId, completed: !completed });
  };

  const openTaskModal = (task = null) => {
    setEditingTask(task);
    if (task) {
      setValue('title', task.title);
      setValue('description', task.description);
      setValue('priority', task.priority);
      setValue('due_date', task.due_date ? formatDate(task.due_date, 'yyyy-MM-dd') : '');
    } else {
      reset();
    }
    setShowTaskModal(true);
  };

  const handleStartTimer = (taskDescription = '') => {
    startTimerMutation.mutate({
      task_description: taskDescription || `Working on ${project.name}`,
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message="Failed to load project details" />;
  }

  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.active;
  const totalHours = timeEntries?.reduce((sum, entry) => sum + entry.duration, 0) || 0;
  const totalCost = totalHours * (project.hourly_rate || 0);
  const completedTasks = tasks?.filter(task => task.completed).length || 0;
  const totalTasks = tasks?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/projects"
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-gray-600">{project.client_name}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
            {project.status}
          </span>
          <button
            onClick={() => handleStartTimer()}
            className="btn-primary btn-md flex items-center"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Timer
          </button>
        </div>
      </div>

      {/* Project Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-primary-100 rounded-full">
              <Clock className="w-6 h-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Hours</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatDuration(totalHours * 3600)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(totalCost)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <CheckSquare className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Tasks</p>
              <p className="text-2xl font-bold text-gray-900">
                {completedTasks}/{totalTasks}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 rounded-full">
              <Calendar className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Deadline</p>
              <p className="text-lg font-bold text-gray-900">
                {project.deadline ? formatDate(project.deadline, 'MMM d') : 'None'}
              </p>
            </div>
          </div>
        </div>
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
              onClick={() => setActiveTab('tasks')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tasks'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Tasks ({totalTasks})
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
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Project Details */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                    <p className="text-gray-900">
                      {project.description || 'No description provided'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">Budget</h4>
                      <p className="text-gray-900">
                        {project.budget ? formatCurrency(project.budget) : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">Hourly Rate</h4>
                      <p className="text-gray-900">
                        {project.hourly_rate ? `${formatCurrency(project.hourly_rate)}/hr` : 'Not set'}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700">Priority</h4>
                      <p className="text-gray-900 capitalize">{project.priority}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress */}
              {project.budget && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget Progress</h3>
                  <div className="bg-gray-200 rounded-full h-4">
                    <div 
                      className="bg-primary-600 h-4 rounded-full" 
                      style={{ 
                        width: `${Math.min((totalCost / project.budget) * 100, 100)}%`
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600 mt-2">
                    <span>{formatCurrency(totalCost)} spent</span>
                    <span>{formatCurrency(project.budget)} budget</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Tasks</h3>
                <button
                  onClick={() => openTaskModal()}
                  className="btn-primary btn-md flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </button>
              </div>

              <div className="space-y-3">
                {tasks?.map((task) => (
                  <div key={task.id} className="flex items-center space-x-3 p-4 bg-gray-50 flex rounded-lg">
                    <button
                      onClick={() => handleToggleTask(task.id, task.completed)}
                      className="flex-shrink-0"
                    >
                      {task.completed ? (
                        <CheckSquare className="w-5 h-5 text-green-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <div className="flex-1">
                      <h4 className={`font-medium ${task.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-sm text-gray-600">{task.description}</p>
                      )}
                      {task.due_date && (
                        <p className="text-xs text-gray-500">
                          Due: {formatDate(task.due_date, 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleStartTimer(task.title)}
                        className="p-2 text-gray-400 hover:text-primary-600"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openTaskModal(task)}
                        className="p-2 text-gray-400 hover:text-primary-600"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-2 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {tasks?.length === 0 && (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500">No tasks yet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'time' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Time Entries</h3>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 flex">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
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
        </div>
      </div>

      {/* Task Modal */}
      <Modal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title={editingTask ? 'Edit Task' : 'Add Task'}
      >
        <form onSubmit={handleSubmit(handleAddTask)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Task Title
            </label>
            <input
              {...register('title', { required: 'Task title is required' })}
              type="text"
              className={`input ${errors.title ? 'border-red-300' : ''}`}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
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
                Priority
              </label>
              <select
                {...register('priority')}
                className="input"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                {...register('due_date')}
                type="date"
                className="input"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowTaskModal(false)}
              className="btn-outline btn-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addTaskMutation.isPending || updateTaskMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {(addTaskMutation.isPending || updateTaskMutation.isPending) ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                editingTask ? 'Update Task' : 'Add Task'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProjectDetail;
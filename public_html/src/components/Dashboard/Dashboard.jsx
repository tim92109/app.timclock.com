import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Clock, 
  Users, 
  FolderOpen, 
  DollarSign, 
  TrendingUp, 
  Calendar,
  Play,
  Pause,
  Square,
  Timer
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { formatCurrency, formatDuration, formatDate } from '../../utils/helpers';
import { USER_ROLES } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';

const Dashboard = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch dashboard data
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(res => res.data),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fetch active time entry for current user
  const { data: activeTimeEntry } = useQuery({
    queryKey: ['active-time-entry'],
    queryFn: () => api.get('/time/active').then(res => res.data),
    refetchInterval: 1000, // Update every second for timer
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message="Failed to load dashboard data" />;
  }

  const stats = dashboardData?.stats || {};
  const recentActivity = dashboardData?.recentActivity || [];
  const upcomingDeadlines = dashboardData?.upcomingDeadlines || [];

  // Calculate elapsed time for active timer
  const getElapsedTime = () => {
    if (!activeTimeEntry?.start_time) return 0;
    const startTime = new Date(activeTimeEntry.start_time);
    return Math.floor((currentTime - startTime) / 1000);
  };

  const elapsedSeconds = getElapsedTime();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.first_name}!
          </h1>
          <p className="mt-2 text-gray-600">
            {formatDate(currentTime, 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <div className="text-right">
            <div className="text-2xl font-mono font-bold text-gray-900">
              {currentTime.toLocaleTimeString()}
            </div>
            <div className="text-sm text-gray-500">Current Time</div>
          </div>
        </div>
      </div>

      {/* Active Timer */}
      {activeTimeEntry && (
        <div className="bg-gradient-to-r from-primary-500 to-secondary-500 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-white bg-opacity-20 rounded-full">
                <Timer className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Active Timer</h3>
                <p className="text-primary-100">
                  {activeTimeEntry.project_name} - {activeTimeEntry.task_description}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-mono font-bold">
                {formatDuration(elapsedSeconds)}
              </div>
              <div className="text-primary-100">Elapsed Time</div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Hours This Week */}
        <div className="bg-white rounded-lg shadow p-6 flex">
          <div className="flex items-center">
            <div className="p-3 bg-primary-100 rounded-full">
              <Clock className="w-6 h-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">This Week</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatDuration((stats.hoursThisWeek || 0) * 3600)}
              </p>
            </div>
          </div>
        </div>

        {/* Active Projects */}
        <div className="bg-white rounded-lg shadow p-6 flex">
          <div className="flex items-center">
            <div className="p-3 bg-secondary-100 rounded-full">
              <FolderOpen className="w-6 h-6 text-secondary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Projects</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.activeProjects || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Clients (Admin/Manager only) */}
        {[USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(user?.role) && (
          <div className="bg-white rounded-lg shadow p-6 flex">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Clients</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalClients || 0}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Revenue This Month (Admin/Manager only) */}
        {[USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(user?.role) && (
          <div className="bg-white rounded-lg shadow p-6 flex">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">This Month</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(stats.revenueThisMonth || 0)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Hours Today */}
        <div className="bg-white rounded-lg shadow p-6 flex">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 rounded-full">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatDuration((stats.hoursToday || 0) * 3600)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          </div>
          <div className="p-6">
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                        <Clock className="w-4 h-4 text-primary-600" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.project_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {activity.task_description}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(activity.start_time, 'MMM d, h:mm a')} - 
                        {formatDuration(activity.duration)} hours
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">
                No recent activity
              </p>
            )}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="bg-white rounded-lg shadow flex flex-col">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Deadlines</h3>
          </div>
          <div className="p-6">
            {upcomingDeadlines.length > 0 ? (
              <div className="space-y-4">
                {upcomingDeadlines.map((deadline, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-red-600" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {deadline.project_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {deadline.client_name}
                      </p>
                      <p className="text-xs text-red-600">
                        Due: {formatDate(deadline.deadline, 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">
                No upcoming deadlines
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6 flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="btn-primary btn-md flex items-center justify-center">
            <Play className="w-4 h-4 mr-2" />
            Start Timer
          </button>
          <button className="btn-secondary btn-md flex items-center justify-center">
            <FolderOpen className="w-4 h-4 mr-2" />
            New Project
          </button>
          <button className="btn-outline btn-md flex items-center justify-center">
            <Users className="w-4 h-4 mr-2" />
            Add Client
          </button>
          <button className="btn-outline btn-md flex items-center justify-center">
            <DollarSign className="w-4 h-4 mr-2" />
            Create Invoice
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
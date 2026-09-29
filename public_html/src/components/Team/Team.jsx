import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, UserMinus } from 'lucide-react';
import { api } from '../../services/api';
import { useSettings } from '../../hooks/useSettings.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { ROLE_CONFIG } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import toast from 'react-hot-toast';

const Team = () => {
  const { t } = useSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: team,
    isLoading: isTeamLoading,
    error: teamError,
  } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/users/team').then((res) => res.data.users),
  });

  const {
    data: available,
    isLoading: isAvailableLoading,
    error: availableError,
  } = useQuery({
    queryKey: ['available-employees'],
    queryFn: () => api.get('/users/available').then((res) => res.data.users),
  });

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['available-employees'] });
  };

  const addMutation = useMutation({
    mutationFn: (id) =>
      api.put(`/users/${id}/manager`, { manager_id: user?.id }),
    onSuccess: () => {
      toast.success(t('team.addSuccess'));
      invalidateTeam();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('team.addError'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id) =>
      api.put(`/users/${id}/manager`, { manager_id: null }),
    onSuccess: () => {
      toast.success(t('team.removeSuccess'));
      invalidateTeam();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('team.removeError'));
    },
  });

  const handleRemove = (id) => {
    if (window.confirm(t('team.confirmRemove'))) {
      removeMutation.mutate(id);
    }
  };

  if (isTeamLoading || isAvailableLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (teamError || availableError) {
    return <ErrorMessage message={t('team.loadError')} />;
  }

  const renderHeader = () => (
    <div className="hidden sm:flex items-center gap-4 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
      <span className="flex-1">{t('team.employee')}</span>
      <span className="flex-1">{t('team.email')}</span>
      <span className="w-28 text-center">{t('team.role')}</span>
      <span className="w-40" />
    </div>
  );

  const renderRow = (member, action) => {
    const roleConfig = ROLE_CONFIG[member.role] || ROLE_CONFIG.employee;

    return (
      <div
        key={member.id}
        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-gray-100 last:border-0"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {member.first_name} {member.last_name}
          </p>
          <p className="text-sm text-gray-500 truncate sm:hidden">
            {member.email || member.username}
          </p>
        </div>
        <div className="hidden sm:block flex-1 min-w-0 text-sm text-gray-500 truncate">
          {member.email || member.username}
        </div>
        <div className="w-28 sm:text-center">
          <span className={`badge ${roleConfig.bgColor} ${roleConfig.textColor}`}>
            {roleConfig.label}
          </span>
        </div>
        <div className="w-40 sm:text-right">{action}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('team.title')}</h1>
        <p className="mt-2 text-gray-600">{t('team.subtitle')}</p>
      </div>

      {/* My Team */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title flex items-center">
            <Users className="w-5 h-5 mr-2 text-gray-400" />
            {t('team.myTeam')}
          </h2>
        </div>
        <div className="card-content pt-0">
          {team?.length > 0 ? (
            <div>
              {renderHeader()}
              {team.map((member) =>
                renderRow(
                  member,
                  <button
                    type="button"
                    onClick={() => handleRemove(member.id)}
                    disabled={removeMutation.isPending || addMutation.isPending}
                    className="btn-outline btn-sm inline-flex items-center"
                  >
                    <UserMinus className="w-4 h-4 mr-1" />
                    {t('team.remove')}
                  </button>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('team.noTeam')}</p>
          )}
        </div>
      </div>

      {/* Available Employees */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title flex items-center">
            <Users className="w-5 h-5 mr-2 text-gray-400" />
            {t('team.available')}
          </h2>
        </div>
        <div className="card-content pt-0">
          {available?.length > 0 ? (
            <div>
              {renderHeader()}
              {available.map((member) =>
                renderRow(
                  member,
                  <button
                    type="button"
                    onClick={() => addMutation.mutate(member.id)}
                    disabled={addMutation.isPending || removeMutation.isPending}
                    className="btn-primary btn-sm inline-flex items-center"
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    {t('team.addToTeam')}
                  </button>
                )
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">{t('team.noAvailable')}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Team;

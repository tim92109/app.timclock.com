import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  Users, 
  Plus, 
  Search, 
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
  MapPin,
  Building
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useSettings } from '../../hooks/useSettings.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { formatDate, isValidEmail, sanitizeForm } from '../../utils/helpers';
import { USER_ROLES } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const Clients = () => {
  const { t } = useSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.CONTRACTOR].includes(user?.role);
  const canDelete = user?.role === USER_ROLES.ADMIN;
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch clients
  const { data: clients, isLoading, error } = useQuery({
    queryKey: ['clients', searchTerm],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      return api.get(`/clients?${params.toString()}`).then(res => res.data);
    },
  });

  // Add client mutation
  const addClientMutation = useMutation({
    mutationFn: (data) => api.post('/clients', data),
    onSuccess: () => {
      toast.success(t('clients.toast.created'));
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowAddModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('clients.toast.createFailed'));
    },
  });

  // Update client mutation
  const updateClientMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/clients/${id}`, data),
    onSuccess: () => {
      toast.success(t('clients.toast.updated'));
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setShowEditModal(false);
      setEditingClient(null);
      resetEdit();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('clients.toast.updateFailed'));
    },
  });

  // Delete client mutation
  const deleteClientMutation = useMutation({
    mutationFn: (id) => api.delete(`/clients/${id}`),
    onSuccess: () => {
      toast.success(t('clients.toast.deleted'));
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('clients.toast.deleteFailed'));
    },
  });

  // Form for adding clients
  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  // Form for editing clients
  const { 
    register: registerEdit, 
    handleSubmit: handleEditSubmit, 
    formState: { errors: editErrors }, 
    reset: resetEdit,
    setValue: setEditValue
  } = useForm();

  // Drop empty optional fields and coerce numeric fields so the API
  // validators accept the form (hourly_rate is required and must be numeric).
  const sanitizeClient = (data) => sanitizeForm(data, ['hourly_rate', 'payment_terms']);

  const handleAddClient = (data) => {
    addClientMutation.mutate(sanitizeClient(data));
  };

  const handleEditClient = (data) => {
    updateClientMutation.mutate({
      id: editingClient.id,
      data: sanitizeClient(data),
    });
  };

  const handleDeleteClient = (id) => {
    if (window.confirm(t('clients.confirmDelete'))) {
      deleteClientMutation.mutate(id);
    }
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    setEditValue('name', client.name);
    setEditValue('email', client.email);
    setEditValue('phone', client.phone);
    setEditValue('address', client.address);
    setEditValue('company', client.company);
    setEditValue('hourly_rate', client.hourly_rate);
    setEditValue('notes', client.notes);
    setShowEditModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={t('clients.loadFailed')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('clients.title')}</h1>
          <p className="mt-2 text-gray-600">{t('clients.subtitle')}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary btn-md flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('clients.newClient')}
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder={t('clients.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients?.map((client) => (
          <div key={client.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {client.name}
                  </h3>
                  {client.company && (
                    <p className="text-sm text-gray-600 mb-2 flex items-center">
                      <Building className="w-4 h-4 mr-1" />
                      {client.company}
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <Link
                    to={`/clients/${client.id}`}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>
                  {canManage && (
                    <button
                      onClick={() => openEditModal(client)}
                      className="p-2 text-gray-400 hover:text-primary-600"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDeleteClient(client.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
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
                    <span className="line-clamp-2">{client.address}</span>
                  </div>
                )}
              </div>

              {/* Client Stats */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {client.project_count || 0}
                    </p>
                    <p className="text-xs text-gray-500">{t('clients.stats.projects')}</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {client.active_projects || 0}
                    </p>
                    <p className="text-xs text-gray-500">{t('clients.stats.activeProjects')}</p>
                  </div>
                </div>
              </div>

              {client.notes && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {client.notes}
                  </p>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-500">
                {t('clients.added')} {formatDate(client.created_at, 'MMM d, yyyy')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {clients?.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('clients.empty.title')}</h3>
          <p className="text-gray-600 mb-4">{t('clients.empty.description')}</p>
          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary btn-md flex items-center mx-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('clients.addClient')}
            </button>
          )}
        </div>
      )}

      {/* Add Client Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={t('clients.addModalTitle')}
      >
        <form onSubmit={handleSubmit(handleAddClient)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.clientName')} *
            </label>
            <input
              {...register('name', {                 required: t('clients.form.clientNameRequired') })}
              type="text"
              className={`input ${errors.name ? 'border-red-300' : ''}`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.email')}
            </label>
            <input
              {...register('email', {
                validate: (value) => !value || isValidEmail(value) || t('clients.form.emailInvalid'),
              })}
              type="email"
              className={`input ${errors.email ? 'border-red-300' : ''}`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('clients.form.phone')}
              </label>
              <input
                {...register('phone')}
                type="tel"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('clients.form.company')}
              </label>
              <input
                {...register('company')}
                type="text"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.hourlyRate')} *
            </label>
            <input
              {...register('hourly_rate', { required: t('clients.form.hourlyRateRequired') })}
              type="number"
              step="0.01"
              className={`input ${errors.hourly_rate ? 'border-red-300' : ''}`}
              placeholder={t('clients.form.hourlyRatePlaceholder')}
            />
            {errors.hourly_rate && (
              <p className="mt-1 text-sm text-red-600">{errors.hourly_rate.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.address')}
            </label>
            <textarea
              {...register('address')}
              rows={2}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.notes')}
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              className="input"
              placeholder={t('clients.form.notesPlaceholder')}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="btn-outline btn-md"
            >
              {t('clients.cancel')}
            </button>
            <button
              type="submit"
              disabled={addClientMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {addClientMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('clients.addClient')
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Client Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('clients.editModalTitle')}
      >
        <form onSubmit={handleEditSubmit(handleEditClient)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.clientName')} *
            </label>
            <input
              {...registerEdit('name', {                 required: t('clients.form.clientNameRequired') })}
              type="text"
              className={`input ${editErrors.name ? 'border-red-300' : ''}`}
            />
            {editErrors.name && (
              <p className="mt-1 text-sm text-red-600">{editErrors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.email')}
            </label>
            <input
              {...registerEdit('email', {
                validate: (value) => !value || isValidEmail(value) || t('clients.form.emailInvalid'),
              })}
              type="email"
              className={`input ${editErrors.email ? 'border-red-300' : ''}`}
            />
            {editErrors.email && (
              <p className="mt-1 text-sm text-red-600">{editErrors.email.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('clients.form.phone')}
              </label>
              <input
                {...registerEdit('phone')}
                type="tel"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('clients.form.company')}
              </label>
              <input
                {...registerEdit('company')}
                type="text"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.hourlyRate')}
            </label>
            <input
              {...registerEdit('hourly_rate')}
              type="number"
              step="0.01"
              className={`input ${editErrors.hourly_rate ? 'border-red-300' : ''}`}
            />
            {editErrors.hourly_rate && (
              <p className="mt-1 text-sm text-red-600">{editErrors.hourly_rate.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.address')}
            </label>
            <textarea
              {...registerEdit('address')}
              rows={2}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('clients.form.notes')}
            </label>
            <textarea
              {...registerEdit('notes')}
              rows={3}
              className="input"
              placeholder={t('clients.form.notesPlaceholder')}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowEditModal(false)}
              className="btn-outline btn-md"
            >
              {t('clients.cancel')}
            </button>
            <button
              type="submit"
              disabled={updateClientMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {updateClientMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('clients.updateClient')
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Clients;
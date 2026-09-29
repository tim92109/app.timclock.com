import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Download,
  Send,
  Trash2,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye
} from 'lucide-react';
import { api } from '../../services/api';
import { useSettings } from '../../hooks/useSettings.jsx';
import { useAuth } from '../../hooks/useAuth.jsx';
import { formatCurrency, formatDate, formatNumber, sanitizeForm } from '../../utils/helpers';
import { INVOICE_STATUSES, USER_ROLES } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const STATUS_LABEL_KEYS = {
  draft: 'billing.statusDraft',
  sent: 'billing.statusSent',
  paid: 'billing.statusPaid',
  overdue: 'billing.statusOverdue',
};

const Billing = () => {
  const { t } = useSettings();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = [USER_ROLES.ADMIN, USER_ROLES.MANAGER, USER_ROLES.CONTRACTOR].includes(user?.role);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewInvoiceId, setViewInvoiceId] = useState(null);
  const showViewModal = Boolean(viewInvoiceId);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    clientId: '',
    startDate: '',
    endDate: '',
  });

  // Fetch invoices
  const { data: invoices, isLoading, error } = useQuery({
    queryKey: ['invoices', searchTerm, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      return api.get(`/billing/invoices?${params.toString()}`).then(res => res.data);
    },
  });

  // Fetch a single invoice for the view/preview modal
  const { data: invoiceDetail, isLoading: isLoadingInvoice } = useQuery({
    queryKey: ['invoice', viewInvoiceId],
    queryFn: () => api.get(`/billing/invoices/${viewInvoiceId}`).then(res => res.data),
    enabled: Boolean(viewInvoiceId),
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get('/clients').then(res => res.data),
  });

  // Fetch projects for dropdown
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(res => res.data),
  });

  // Fetch projects with unbilled time for the estimate helper
  const { data: billableProjects } = useQuery({
    queryKey: ['billable-projects'],
    queryFn: () => api.get('/billing/billable-projects').then(res => res.data),
    enabled: canManage,
  });

  // Fetch billing summary
  const { data: billingSummary } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: () => api.get('/billing/summary').then(res => res.data),
  });

  // Create invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: (data) => api.post('/billing/invoices', data),
    onSuccess: () => {
      toast.success(t('billing.toastCreated'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['billable-projects'] });
      setShowCreateModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('billing.toastCreateFailed'));
    },
  });

  // Mark invoice as sent mutation (sets status only; no email is sent)
  const markSentMutation = useMutation({
    mutationFn: (id) => api.post(`/billing/invoices/${id}/mark-sent`),
    onSuccess: () => {
      toast.success(t('billing.toastMarkedSent'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('billing.toastMarkSentFailed'));
    },
  });

  // Mark invoice as paid mutation
  const markPaidMutation = useMutation({
    mutationFn: (id) => api.post(`/billing/invoices/${id}/mark-paid`),
    onSuccess: () => {
      toast.success(t('billing.toastPaid'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('billing.toastPaidFailed'));
    },
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => api.delete(`/billing/invoices/${id}`),
    onSuccess: () => {
      toast.success(t('billing.toastDeleted'));
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('billing.toastDeleteFailed'));
    },
  });

  // Form for creating invoices
  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
    defaultValues: { discount_type: 'amount' },
  });

  const selectedClientId = watch('client_id');
  const selectedProjectId = watch('project_id');

  const billableProjectsList = Array.isArray(billableProjects)
    ? billableProjects
    : billableProjects?.projects ?? [];

  const selectedBillableProject = selectedProjectId
    ? billableProjectsList.find(project => project.id === parseInt(selectedProjectId, 10))
    : null;

  // Live (client-side) totals preview for the create modal
  const watchedAmount = watch('amount');
  const watchedDiscountType = watch('discount_type');
  const watchedDiscountValue = watch('discount_value');
  const watchedTaxRate = watch('tax_rate');

  const previewBaseSubtotal = (() => {
    if (watchedAmount !== '' && watchedAmount !== null && watchedAmount !== undefined) {
      const parsedAmount = Number(watchedAmount);
      if (!Number.isNaN(parsedAmount)) return parsedAmount;
    }
    const unbilled = Number(selectedBillableProject?.unbilled_amount);
    return Number.isNaN(unbilled) ? 0 : unbilled;
  })();

  const previewDiscountValue = Number(watchedDiscountValue) || 0;
  const rawDiscount = watchedDiscountType === 'percent'
    ? (previewBaseSubtotal * previewDiscountValue) / 100
    : previewDiscountValue;
  const previewDiscount = Number.isNaN(rawDiscount)
    ? 0
    : Math.min(Math.max(rawDiscount, 0), previewBaseSubtotal);
  const previewTaxable = previewBaseSubtotal - previewDiscount;
  const previewTaxRate = Number(watchedTaxRate) || 0;
  const previewTax = (previewTaxable * previewTaxRate) / 100;
  const previewTotal = previewTaxable + previewTax;

  const handleCreateInvoice = (data) => {
    createInvoiceMutation.mutate(
      sanitizeForm(data, ['client_id', 'project_id', 'amount', 'discount_value', 'tax_rate'])
    );
  };

  const handleMarkSent = (id) => {
    if (window.confirm(t('billing.confirmMarkSent'))) {
      markSentMutation.mutate(id);
    }
  };

  const handleMarkPaid = (id) => {
    if (window.confirm(t('billing.confirmMarkPaid'))) {
      markPaidMutation.mutate(id);
    }
  };

  const handleDeleteInvoice = (id) => {
    if (window.confirm(t('billing.confirmDelete'))) {
      deleteInvoiceMutation.mutate(id);
    }
  };

  const downloadInvoice = async (id) => {
    try {
      const res = await api.get(`/billing/invoices/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast.error(error.response?.data?.message || t('billing.downloadError'));
    }
  };

  const getStatusLabel = (status) => t(STATUS_LABEL_KEYS[status], status);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'sent':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'overdue':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusConfig = (status) => {
    const configs = {
      draft: { bgColor: 'bg-gray-100', textColor: 'text-gray-800' },
      sent: { bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
      paid: { bgColor: 'bg-green-100', textColor: 'text-green-800' },
      overdue: { bgColor: 'bg-red-100', textColor: 'text-red-800' },
    };
    return configs[status] || configs.draft;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorMessage message={t('billing.loadError')} />;
  }

  // Filter projects by selected client
  const filteredProjects = selectedClientId 
    ? projects?.filter(project => project.client?.id === parseInt(selectedClientId, 10))
    : projects;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('billing.title')}</h1>
          <p className="mt-2 text-gray-600">{t('billing.subtitle')}</p>
        </div>
        <div className="mt-4 sm:mt-0">
          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary btn-md flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('billing.createInvoice')}
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {billingSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('billing.totalRevenue')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(billingSummary.totalRevenue || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('billing.pending')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(billingSummary.pendingAmount || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('billing.overdue')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(billingSummary.overdueAmount || 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-primary-100 rounded-full">
                <FileText className="w-6 h-6 text-primary-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('billing.totalInvoices')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {billingSummary.totalInvoices || 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder={t('billing.searchInvoices')}
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
              <option value="">{t('billing.allStatuses')}</option>
              {Object.entries(INVOICE_STATUSES).map(([key, value]) => (
                <option key={key} value={value}>
                  {getStatusLabel(value)}
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
              <option value="">{t('billing.allClients')}</option>
              {clients?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input"
              placeholder={t('billing.startDate')}
            />
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{t('billing.invoices')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.invoice')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.client')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.amount')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.date')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.dueDate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('billing.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices?.map((invoice) => {
                const statusConfig = getStatusConfig(invoice.status);
                
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(invoice.status)}
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            #{invoice.invoice_number}
                          </div>
                          {invoice.project?.name && (
                            <div className="text-sm text-gray-500">
                              {invoice.project?.name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.client?.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.total_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(invoice.created_at, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.due_date ? formatDate(invoice.due_date, 'MMM d, yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setViewInvoiceId(invoice.id)}
                          className="text-gray-400 hover:text-gray-600"
                          title={t('billing.viewInvoice')}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {canManage && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => downloadInvoice(invoice.id)}
                              className="text-gray-400 hover:text-gray-600"
                              title={t('billing.download')}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            
                            {invoice.status === 'draft' && (
                              <button
                                onClick={() => handleMarkSent(invoice.id)}
                                className="text-blue-600 hover:text-blue-900"
                                title={t('billing.markSent')}
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            
                            {invoice.status !== INVOICE_STATUSES.PAID && (
                              <button
                                onClick={() => handleMarkPaid(invoice.id)}
                                className="text-green-600 hover:text-green-900"
                                title={t('billing.markPaid')}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            
                            <button
                              onClick={() => handleDeleteInvoice(invoice.id)}
                              className="text-red-600 hover:text-red-900"
                              title={t('billing.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {invoices?.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('billing.noInvoices')}</h3>
            <p className="text-gray-600 mb-4">{t('billing.noInvoicesHint')}</p>
            {canManage && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary btn-md flex items-center mx-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('billing.createInvoice')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('billing.createNewInvoice')}
        size="lg"
      >
        <form onSubmit={handleSubmit(handleCreateInvoice)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('billing.client')} *
              </label>
              <select
                {...register('client_id', { required: t('billing.clientRequired') })}
                className={`input ${errors.client_id ? 'border-red-300' : ''}`}
              >
                <option value="">{t('billing.selectClient')}</option>
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
                {t('billing.project')}
              </label>
              <select
                {...register('project_id')}
                className="input"
              >
                <option value="">{t('billing.selectProject')}</option>
                {filteredProjects?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('billing.amount')}
              </label>
              <input
                {...register('amount', { 
                  validate: (value) =>
                    value === '' || value === null || value === undefined ||
                    Number(value) > 0 || t('billing.amountMin')
                })}
                type="number"
                step="0.01"
                className={`input ${errors.amount ? 'border-red-300' : ''}`}
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">{t('billing.amountOptionalHint')}</p>
              {selectedProjectId && (
                <p className="mt-1 text-sm text-gray-600">
                  {selectedBillableProject && selectedBillableProject.unbilled_hours > 0
                    ? `${t('billing.unbilledLabel')}: ${selectedBillableProject.unbilled_hours} h — ${formatCurrency(selectedBillableProject.unbilled_amount)}`
                    : t('billing.noUnbilledTime')}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('billing.dueDateOptional')}
              </label>
              <input
                {...register('due_date')}
                type="date"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('billing.discountType')}
              </label>
              <select
                {...register('discount_type')}
                className="input"
              >
                <option value="amount">{t('billing.discountTypeAmount')}</option>
                <option value="percent">{t('billing.discountTypePercent')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('billing.discountValue')}
              </label>
              <input
                {...register('discount_value')}
                type="number"
                min="0"
                step="0.01"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('billing.taxRate')}
              </label>
              <input
                {...register('tax_rate')}
                type="number"
                min="0"
                step="0.01"
                className="input"
              />
              <p className="mt-1 text-xs text-gray-500">{t('billing.taxOptionalHint')}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('billing.description')}
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="input"
              placeholder={t('billing.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('billing.includeTimeEntries')}
            </label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  {...register('include_time_entries')}
                  type="checkbox"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  {t('billing.includeTimeEntriesHint')}
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">{t('billing.subtotal')}</span>
              <span className="text-gray-900">{formatCurrency(previewBaseSubtotal)}</span>
            </div>
            {previewDiscount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{t('billing.discount')}</span>
                <span className="text-gray-900">- {formatCurrency(previewDiscount)}</span>
              </div>
            )}
            {previewTax > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  {t('billing.taxLabel')} ({formatNumber(previewTaxRate, 2)}%)
                </span>
                <span className="text-gray-900">{formatCurrency(previewTax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
              <span className="text-gray-900">{t('billing.total')}</span>
              <span className="text-gray-900">{formatCurrency(previewTotal)}</span>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="btn-outline btn-md"
            >
              {t('billing.cancel')}
            </button>
            <button
              type="submit"
              disabled={createInvoiceMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {createInvoiceMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                t('billing.createInvoice')
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Invoice Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setViewInvoiceId(null)}
        title={t('billing.invoiceDetails')}
        size="lg"
      >
        {isLoadingInvoice ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : invoiceDetail?.invoice ? (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{t('billing.invoice')}</p>
                <p className="text-xl font-semibold text-gray-900">
                  #{invoiceDetail.invoice.invoice_number}
                </p>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusConfig(invoiceDetail.invoice.status).bgColor} ${getStatusConfig(invoiceDetail.invoice.status).textColor}`}>
                {getStatusLabel(invoiceDetail.invoice.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">{t('billing.issueDate')}</p>
                <p className="text-gray-900">
                  {invoiceDetail.invoice.issue_date
                    ? formatDate(invoiceDetail.invoice.issue_date, 'MMM d, yyyy')
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">{t('billing.dueDate')}</p>
                <p className="text-gray-900">
                  {invoiceDetail.invoice.due_date
                    ? formatDate(invoiceDetail.invoice.due_date, 'MMM d, yyyy')
                    : '-'}
                </p>
              </div>
            </div>

            <div className="text-sm">
              <p className="text-gray-500">{t('billing.billTo')}</p>
              <p className="font-medium text-gray-900">{invoiceDetail.invoice.client?.name}</p>
              {invoiceDetail.invoice.client?.company && (
                <p className="text-gray-700">{invoiceDetail.invoice.client.company}</p>
              )}
              {invoiceDetail.invoice.client?.email && (
                <p className="text-gray-700">{invoiceDetail.invoice.client.email}</p>
              )}
            </div>

            {invoiceDetail.invoice.project?.name && (
              <div className="text-sm">
                <p className="text-gray-500">{t('billing.project')}</p>
                <p className="text-gray-900">{invoiceDetail.invoice.project.name}</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('billing.description')}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('billing.quantity')}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('billing.rate')}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('billing.amount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoiceDetail.items?.length ? (
                    invoiceDetail.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2 text-sm text-gray-900">{item.description}</td>
                        <td className="px-3 py-2 text-sm text-gray-900 text-right">
                          {formatNumber(item.quantity, 2)}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 text-right">
                          {formatCurrency(item.rate, invoiceDetail.invoice.currency || 'USD')}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 text-right">
                          {formatCurrency(item.amount, invoiceDetail.invoice.currency || 'USD')}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500">
                        {t('billing.noItems')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <div className="w-full sm:w-64 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('billing.subtotal')}</span>
                  <span className="text-gray-900">
                    {formatCurrency(invoiceDetail.invoice.subtotal, invoiceDetail.invoice.currency || 'USD')}
                  </span>
                </div>
                {invoiceDetail.invoice.discount_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      {t('billing.discount')}
                      {invoiceDetail.invoice.discount_type === 'percent' && invoiceDetail.invoice.discount_value != null
                        ? ` (${invoiceDetail.invoice.discount_value}%)`
                        : ''}
                    </span>
                    <span className="text-gray-900">
                      - {formatCurrency(invoiceDetail.invoice.discount_amount, invoiceDetail.invoice.currency || 'USD')}
                    </span>
                  </div>
                )}
                {invoiceDetail.invoice.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      {t('billing.taxLabel')} ({formatNumber(invoiceDetail.invoice.tax_rate || 0, 2)}%)
                    </span>
                    <span className="text-gray-900">
                      {formatCurrency(invoiceDetail.invoice.tax_amount, invoiceDetail.invoice.currency || 'USD')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                  <span className="text-gray-900">{t('billing.total')}</span>
                  <span className="text-gray-900">
                    {formatCurrency(invoiceDetail.invoice.total_amount, invoiceDetail.invoice.currency || 'USD')}
                  </span>
                </div>
              </div>
            </div>

            {(invoiceDetail.invoice.notes || invoiceDetail.invoice.terms) && (
              <div className="space-y-3 text-sm">
                {invoiceDetail.invoice.notes && (
                  <div>
                    <p className="text-gray-500">{t('billing.notes')}</p>
                    <p className="text-gray-900 whitespace-pre-wrap">{invoiceDetail.invoice.notes}</p>
                  </div>
                )}
                {invoiceDetail.invoice.terms && (
                  <div>
                    <p className="text-gray-500">{t('billing.terms')}</p>
                    <p className="text-gray-900 whitespace-pre-wrap">{invoiceDetail.invoice.terms}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-4">
              {invoiceDetail.invoice.status === INVOICE_STATUSES.DRAFT && (
                <button
                  type="button"
                  onClick={() => handleMarkSent(invoiceDetail.invoice.id)}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {t('billing.markSent')}
                </button>
              )}
              {invoiceDetail.invoice.status !== INVOICE_STATUSES.PAID && (
                <button
                  type="button"
                  onClick={() => handleMarkPaid(invoiceDetail.invoice.id)}
                  className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t('billing.markPaid')}
                </button>
              )}
              <button
                type="button"
                onClick={() => downloadInvoice(viewInvoiceId)}
                className="btn-outline btn-md flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                {t('billing.download')}
              </button>
              <button
                type="button"
                onClick={() => setViewInvoiceId(null)}
                className="btn-primary btn-md"
              >
                {t('billing.close')}
              </button>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-gray-600">
            {t('billing.loadError')}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Billing;
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { 
  DollarSign, 
  Plus, 
  Search, 
  Filter,
  Download,
  Send,
  Eye,
  Edit,
  Trash2,
  FileText,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { api } from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { INVOICE_STATUSES } from '../../utils/constants';
import LoadingSpinner from '../Common/LoadingSpinner';
import ErrorMessage from '../Common/ErrorMessage';
import Modal from '../Common/Modal';
import toast from 'react-hot-toast';

const Billing = () => {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  // Fetch billing summary
  const { data: billingSummary } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: () => api.get('/billing/summary').then(res => res.data),
  });

  // Create invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: (data) => api.post('/billing/invoices', data),
    onSuccess: () => {
      toast.success('Invoice created successfully');
      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['billing-summary']);
      setShowCreateModal(false);
      reset();
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to create invoice');
    },
  });

  // Send invoice mutation
  const sendInvoiceMutation = useMutation({
    mutationFn: (id) => api.post(`/billing/invoices/${id}/send`),
    onSuccess: () => {
      toast.success('Invoice sent successfully');
      queryClient.invalidateQueries(['invoices']);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to send invoice');
    },
  });

  // Mark invoice as paid mutation
  const markPaidMutation = useMutation({
    mutationFn: (id) => api.post(`/billing/invoices/${id}/mark-paid`),
    onSuccess: () => {
      toast.success('Invoice marked as paid');
      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['billing-summary']);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to mark invoice as paid');
    },
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: (id) => api.delete(`/billing/invoices/${id}`),
    onSuccess: () => {
      toast.success('Invoice deleted successfully');
      queryClient.invalidateQueries(['invoices']);
      queryClient.invalidateQueries(['billing-summary']);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Failed to delete invoice');
    },
  });

  // Form for creating invoices
  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm();

  const selectedClientId = watch('client_id');

  const handleCreateInvoice = (data) => {
    createInvoiceMutation.mutate(data);
  };

  const handleSendInvoice = (id) => {
    if (window.confirm('Are you sure you want to send this invoice?')) {
      sendInvoiceMutation.mutate(id);
    }
  };

  const handleMarkPaid = (id) => {
    if (window.confirm('Mark this invoice as paid?')) {
      markPaidMutation.mutate(id);
    }
  };

  const handleDeleteInvoice = (id) => {
    if (window.confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      deleteInvoiceMutation.mutate(id);
    }
  };

  const downloadInvoice = (id) => {
    window.open(`/api/billing/invoices/${id}/download`, '_blank');
  };

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
    return <ErrorMessage message="Failed to load billing data" />;
  }

  // Filter projects by selected client
  const filteredProjects = selectedClientId 
    ? projects?.filter(project => project.client_id === parseInt(selectedClientId))
    : projects;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Invoices</h1>
          <p className="mt-2 text-gray-600">Manage invoices and track payments</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary btn-md flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Invoice
          </button>
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
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
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
                <p className="text-sm font-medium text-gray-600">Pending</p>
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
                <p className="text-sm font-medium text-gray-600">Overdue</p>
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
                <p className="text-sm font-medium text-gray-600">Total Invoices</p>
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
                placeholder="Search invoices..."
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
              {Object.entries(INVOICE_STATUSES).map(([key, value]) => (
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
          <div>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input"
              placeholder="Start Date"
            />
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 flex">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices?.map((invoice) => {
                const statusConfig = getStatusConfig(invoice.status);
                
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50 hover:flex">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(invoice.status)}
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            #{invoice.invoice_number}
                          </div>
                          {invoice.project_name && (
                            <div className="text-sm text-gray-500">
                              {invoice.project_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {invoice.client_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                        {invoice.status}
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
                          onClick={() => downloadInvoice(invoice.id)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        
                        {invoice.status === 'draft' && (
                          <button
                            onClick={() => handleSendInvoice(invoice.id)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Send Invoice"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        
                        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                          <button
                            onClick={() => handleMarkPaid(invoice.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Mark as Paid"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleDeleteInvoice(invoice.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No invoices found</h3>
            <p className="text-gray-600 mb-4">Create your first invoice to get started.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary btn-md flex items-center mx-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Invoice
            </button>
          </div>
        )}
      </div>

      {/* Create Invoice Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Invoice"
        size="lg"
      >
        <form onSubmit={handleSubmit(handleCreateInvoice)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client *
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
                Project
              </label>
              <select
                {...register('project_id')}
                className="input"
              >
                <option value="">Select a project (optional)</option>
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
                Amount *
              </label>
              <input
                {...register('amount', { 
                  required: 'Amount is required',
                  min: { value: 0.01, message: 'Amount must be greater than 0' }
                })}
                type="number"
                step="0.01"
                className={`input ${errors.amount ? 'border-red-300' : ''}`}
              />
              {errors.amount && (
                <p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
              )}
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={3}
              className="input"
              placeholder="Invoice description or notes..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Include Time Entries
            </label>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  {...register('include_time_entries')}
                  type="checkbox"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Include unbilled time entries for this project
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="btn-outline btn-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createInvoiceMutation.isPending}
              className="btn-primary btn-md flex items-center"
            >
              {createInvoiceMutation.isPending ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                'Create Invoice'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Billing;
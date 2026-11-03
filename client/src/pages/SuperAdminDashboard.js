import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRefresh } from '../contexts/RefreshContext';
import { scrollToTop } from '../utils/scrollUtils';
import {
  Shield,
  Users,
  UserCheck,
  Plus,
  Trash2,
  Building2,
  BarChart3,
  FileText,
  Search,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Edit,
  Edit3,
  Save,
  X,
  Trash,
  Filter,
  Download,
  Tags
} from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/LoadingSpinner';
import OrganizationManagement from './OrganizationManagement';
import SuperAdminUserManagement from '../components/SuperAdminUserManagement';
import LeadVendorOptionsModal from '../components/LeadVendorOptionsModal';
import LeadReassignModal from '../components/LeadReassignModal';
import Pagination from '../components/Pagination';
import { formatEasternTimeForDisplay, formatEasternTime, getEasternNow, formatDateAsDDMMYYYY } from '../utils/dateUtils';

const SuperAdminDashboard = () => {
  const { user } = useAuth();
  const { registerRefreshCallback, unregisterRefreshCallback } = useRefresh();
  const [admins, setAdmins] = useState([]);
  const [agents, setAgents] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [leads, setLeads] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showManageVendorsModal, setShowManageVendorsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Lead view/edit modal — full detail parity with the main-org admin dashboard
  const [showViewModal, setShowViewModal] = useState(false);
  const [editedLead, setEditedLead] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Lead reassignment
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [leadToReassign, setLeadToReassign] = useState(null);
  
  // Pagination state for leads
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 500,
    total: 0,
    pages: 0
  });
  
  // Lead tracking filters
  const [leadFilters, setLeadFilters] = useState({
    search: '',
    leadId: '',
    startDate: '',
    endDate: '',
    status: '',
    category: '',
    qualificationStatus: '',
    assignedTo: '',
    duplicateStatus: '',
    organization: ''
  });

  // Admin and Agent filters
  const [adminFilters, setAdminFilters] = useState({
    search: '',
    organization: '',
    status: ''
  });

  const [agentFilters, setAgentFilters] = useState({
    search: '',
    organization: '',
    status: ''
  });

  // Keep latest filters handy without recreating callbacks
  const adminFiltersRef = useRef(adminFilters);
  const agentFiltersRef = useRef(agentFilters);

  useEffect(() => {
    adminFiltersRef.current = adminFilters;
  }, [adminFilters]);

  useEffect(() => {
    agentFiltersRef.current = agentFilters;
  }, [agentFilters]);

  // Lead form data for create/edit
  const [leadFormData, setLeadFormData] = useState({
    name: '',
    email: '',
    phone: '',
    alternatePhone: '',
    debtCategory: 'unsecured',
    debtTypes: [],
    totalDebtAmount: '',
    numberOfCreditors: '',
    monthlyDebtPayment: '',
    creditScore: '',
    creditScoreRange: '',
    address: '',
    city: '',
    state: '',
    zipcode: '',
    notes: '',
    requirements: '',
    leadVendor: '',
    organization: ''
  });

  // Managed Lead Vendor options — used by the Edit Lead dropdown below.
  const [leadVendorOptions, setLeadVendorOptions] = useState([]);
  useEffect(() => {
    axios.get('/api/lead-vendor-options')
      .then(res => { if (res.data?.success) setLeadVendorOptions(res.data.data || []); })
      .catch(() => {});
  }, []);

  const fetchAdmins = useCallback(async (filters = adminFiltersRef.current) => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.organization) params.append('organization', filters.organization);
      if (filters.status) params.append('status', filters.status);

      const response = await axios.get(`/api/auth/admins?${params.toString()}`);
      const adminsData = Array.isArray(response.data?.data) ? response.data.data : [];
      setAdmins(adminsData);
    } catch (error) {
      console.error('Error fetching admins:', error);
      toast.error('Failed to load admins');
      setAdmins([]);
    }
  }, []);

  const fetchAgents = useCallback(async (filters = agentFiltersRef.current) => {
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.organization) params.append('organization', filters.organization);
      if (filters.status) params.append('status', filters.status);

      const response = await axios.get(`/api/auth/agents?${params.toString()}`);
      const agentsData = Array.isArray(response.data?.data) ? response.data.data : [];
      setAgents(agentsData);
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to load agents');
      setAgents([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [organizationsResponse, statsResponse] = await Promise.all([
        axios.get('/api/organizations'),
        axios.get('/api/leads/dashboard/stats')
      ]);
      const organizationsData = Array.isArray(organizationsResponse.data?.data) ? organizationsResponse.data.data : [];
      setOrganizations(organizationsData);
      setDashboardStats(statsResponse.data?.data || null);
      
      // Fetch admins and agents with their respective filters
      await Promise.all([fetchAdmins(), fetchAgents()]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load dashboard data');
      setOrganizations([]);
      setDashboardStats(null);
    } finally {
      setLoading(false);
    }
  }, [fetchAdmins, fetchAgents]);

  // Lead tracking functions
  const fetchLeads = useCallback(async (page = pagination.page) => {
    try {
      setLeadsLoading(true);
      const params = new URLSearchParams();
      
      // Add pagination parameters
      params.append('page', page.toString());
      params.append('limit', pagination.limit.toString());
      
      // Add filters to params
      if (leadFilters.search) params.append('search', leadFilters.search);
      if (leadFilters.leadId) params.append('leadId', leadFilters.leadId);
      if (leadFilters.startDate) params.append('startDate', leadFilters.startDate);
      if (leadFilters.endDate) params.append('endDate', leadFilters.endDate);
      if (leadFilters.status) params.append('status', leadFilters.status);
      if (leadFilters.category) params.append('category', leadFilters.category);
      if (leadFilters.qualificationStatus) params.append('qualificationStatus', leadFilters.qualificationStatus);
      if (leadFilters.assignedTo) params.append('assignedTo', leadFilters.assignedTo);
      if (leadFilters.duplicateStatus) params.append('duplicateStatus', leadFilters.duplicateStatus);
      if (leadFilters.organization) params.append('organization', leadFilters.organization);

      const response = await axios.get(`/api/leads?${params.toString()}`);
      const responseData = response.data?.data;
      const leadsData = responseData?.leads;
      const paginationData = responseData?.pagination;
      
      setLeads(leadsData || []);
      
      // Update pagination state if we have pagination data
      if (paginationData) {
        setPagination({
          page: paginationData.page,
          limit: paginationData.limit,
          total: paginationData.total,
          pages: paginationData.pages
        });
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      toast.error('Failed to load leads');
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, [
    pagination.page,
    pagination.limit,
    leadFilters.search,
    leadFilters.leadId,
    leadFilters.startDate,
    leadFilters.endDate,
    leadFilters.status,
    leadFilters.category,
    leadFilters.qualificationStatus,
    leadFilters.assignedTo,
    leadFilters.duplicateStatus,
    leadFilters.organization
  ]);

  // Handle refresh functionality
  const handleDashboardRefresh = useCallback(() => {
    // Scroll to top using utility function
    scrollToTop();
    
    // Close all modals and reset form states
    setShowLeadModal(false);
    setShowViewModal(false);
    setSelectedLead(null);
    setEditedLead(null);
    setIsEditing(false);
    
    // Reset to overview tab
    setActiveTab('overview');
    
    // Reset pagination
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Refetch all data
    fetchData();
    if (activeTab === 'leads') {
      fetchLeads(1);
    }
    toast.success('Dashboard refreshed!');
  }, [fetchData, fetchLeads, activeTab]);

  // Register refresh callback
  useEffect(() => {
    registerRefreshCallback('superadmin', handleDashboardRefresh);
    return () => {
      unregisterRefreshCallback('superadmin');
    };
  }, [registerRefreshCallback, unregisterRefreshCallback, handleDashboardRefresh]);

  // Main effect to fetch initial data
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refetch admins when admin filters change
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchAdmins(adminFilters);
    }
  }, [adminFilters.search, adminFilters.organization, adminFilters.status, activeTab, fetchAdmins]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch agents when agent filters change
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchAgents(agentFilters);
    }
  }, [agentFilters.search, agentFilters.organization, agentFilters.status, activeTab, fetchAgents]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeleteAdmin = async (adminId, adminName) => {
    if (window.confirm(`Are you sure you want to delete admin "${adminName}"? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/auth/admins/${adminId}`);
        toast.success('Admin deleted successfully');
        fetchAdmins();
      } catch (error) {
        console.error('Error deleting admin:', error);
        toast.error(error.response?.data?.message || 'Failed to delete admin');
      }
    }
  };

  const handleToggleAdminStatus = async (adminId, currentStatus) => {
    try {
      await axios.put(`/api/auth/admins/${adminId}/status`, { 
        isActive: !currentStatus 
      });
      toast.success(`Admin ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchAdmins();
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error(error.response?.data?.message || 'Failed to update admin status');
    }
  };

  const handleToggleAgentStatus = async (agentId, currentStatus) => {
    try {
      await axios.put(`/api/auth/agents/${agentId}/status`, { 
        isActive: !currentStatus 
      });
      toast.success(`Agent ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchAgents();
    } catch (error) {
      console.error('Error updating agent status:', error);
      toast.error(error.response?.data?.message || 'Failed to update agent status');
    }
  };

  const handleDeleteAgent = async (agentId, agentName) => {
    if (window.confirm(`Are you sure you want to delete agent "${agentName}"? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/auth/agents/${agentId}`);
        toast.success('Agent deleted successfully');
        fetchAgents();
      } catch (error) {
        console.error('Error deleting agent:', error);
        toast.error(error.response?.data?.message || 'Failed to delete agent');
      }
    }
  };

  // Pagination handler for leads
  const handlePageChange = async (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      setPagination(prev => ({ ...prev, page: newPage }));
      await fetchLeads(newPage);
    }
  };

  // Reset pagination when filters change
  const resetPaginationAndFetchLeads = useCallback(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLeads(1);
  }, [fetchLeads]);

  // Reset pagination when lead filters change
  useEffect(() => {
    if (activeTab === 'leads') {
      resetPaginationAndFetchLeads();
    }
  }, [
    leadFilters.search,
    leadFilters.leadId,
    leadFilters.startDate,
    leadFilters.endDate,
    leadFilters.status,
    leadFilters.category,
    leadFilters.qualificationStatus,
    leadFilters.assignedTo,
    leadFilters.duplicateStatus,
    leadFilters.organization,
    resetPaginationAndFetchLeads,
    activeTab
  ]);

  const handleCreateLead = async (e) => {
    e.preventDefault();

    if (!leadFormData.organization) {
      toast.error('Please select an organization');
      return;
    }

    setSubmitting(true);

    try {
      const cleanData = {
        name: leadFormData.name.trim(),
        organization: leadFormData.organization
      };

      // Add optional fields if they have values
      if (leadFormData.email) cleanData.email = leadFormData.email.trim();
      if (leadFormData.phone) {
        const cleaned = leadFormData.phone.replace(/\D/g, '');
        cleanData.phone = `+${cleaned}`;
      }
      if (leadFormData.alternatePhone) {
        const cleaned = leadFormData.alternatePhone.replace(/\D/g, '');
        cleanData.alternatePhone = `+${cleaned}`;
      }

      cleanData.debtCategory = leadFormData.debtCategory;
      cleanData.debtTypes = leadFormData.debtTypes;

      if (leadFormData.totalDebtAmount) cleanData.totalDebtAmount = parseFloat(leadFormData.totalDebtAmount);
      if (leadFormData.numberOfCreditors) cleanData.numberOfCreditors = parseInt(leadFormData.numberOfCreditors);
      if (leadFormData.monthlyDebtPayment) cleanData.monthlyDebtPayment = parseFloat(leadFormData.monthlyDebtPayment);
      if (leadFormData.creditScore) cleanData.creditScore = parseInt(leadFormData.creditScore);
      if (leadFormData.creditScoreRange) cleanData.creditScoreRange = leadFormData.creditScoreRange;

      if (leadFormData.address) cleanData.address = leadFormData.address.trim();
      if (leadFormData.city) cleanData.city = leadFormData.city.trim();
      if (leadFormData.state) cleanData.state = leadFormData.state.trim();
      if (leadFormData.zipcode) cleanData.zipcode = leadFormData.zipcode.trim();
      if (leadFormData.notes) cleanData.notes = leadFormData.notes.trim();
      if (leadFormData.requirements) cleanData.requirements = leadFormData.requirements.trim();

      // Add creator information
      cleanData.lastUpdatedBy = user?.name || 'SuperAdmin';

      await axios.post('/api/leads', cleanData);
      toast.success('Lead created successfully!');
      
      // Reset form
      setLeadFormData({
        name: '',
        email: '',
        phone: '',
        alternatePhone: '',
        debtCategory: 'unsecured',
        debtTypes: [],
        totalDebtAmount: '',
        numberOfCreditors: '',
        monthlyDebtPayment: '',
        creditScore: '',
        creditScoreRange: '',
        address: '',
        city: '',
        state: '',
        zipcode: '',
        notes: '',
        requirements: '',
        leadVendor: '',
        organization: ''
      });

      setShowLeadModal(false);
      fetchLeads();
    } catch (error) {
      console.error('Error creating lead:', error);
      toast.error(error.response?.data?.message || 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLead = async (leadId, leadName) => {
    if (window.confirm(`Are you sure you want to delete lead "${leadName}"? This action cannot be undone.`)) {
      try {
        await axios.delete(`/api/leads/${leadId}`);
        toast.success('Lead deleted successfully');
        fetchLeads();
      } catch (error) {
        console.error('Error deleting lead:', error);
        toast.error(error.response?.data?.message || 'Failed to delete lead');
      }
    }
  };

  // ── Lead View/Edit modal — full detail parity with the main-org admin
  // dashboard. SuperAdmin always has full edit rights here (this page is
  // superadmin-only), so no role gate is needed on any field.
  const openViewModal = (lead) => {
    setSelectedLead(lead);
    setEditedLead({ ...lead });
    setIsEditing(false);
    setShowViewModal(true);
  };

  const closeViewModal = () => {
    setShowViewModal(false);
    setSelectedLead(null);
    setEditedLead(null);
    setIsEditing(false);
    setIsUpdating(false);
  };

  const handleEditToggle = () => {
    if (isEditing) setEditedLead({ ...selectedLead });
    setIsEditing(!isEditing);
  };

  const handleCancelEdit = () => {
    setEditedLead({ ...selectedLead });
    setIsEditing(false);
  };

  const handleInputChange = (field, value) => {
    setEditedLead(prev => ({ ...prev, [field]: value }));
  };

  const handleLeadUpdate = async () => {
    if (!editedLead) return;
    setIsUpdating(true);
    try {
      const updateData = {
        ...editedLead,
        totalDebtAmount: editedLead.totalDebtAmount ? parseInt(editedLead.totalDebtAmount) : undefined,
        numberOfCreditors: editedLead.numberOfCreditors ? parseInt(editedLead.numberOfCreditors) : undefined,
        monthlyDebtPayment: editedLead.monthlyDebtPayment ? parseInt(editedLead.monthlyDebtPayment) : undefined,
        conversionValue: editedLead.conversionValue ? parseInt(editedLead.conversionValue) : undefined,
      };
      updateData.lastUpdatedBy = user?.name || 'SuperAdmin';
      updateData.lastUpdatedAt = formatEasternTime(getEasternNow());

      const response = await axios.put(`/api/leads/${editedLead._id}`, updateData);
      const updatedLead = response.data?.data?.lead;
      if (updatedLead) {
        // PUT /:id doesn't populate `organization` (just returns the raw id),
        // unlike GET /. Organization is read-only in this modal and never
        // changes here, so carry the already-populated value forward instead
        // of letting it collapse to an id and show as "—" until the next fetch.
        const merged = { ...updatedLead, organization: selectedLead.organization };
        setLeads(prev => prev.map(l => l._id === editedLead._id ? merged : l));
        setSelectedLead(merged);
        setEditedLead(merged);
      }
      setIsEditing(false);
      toast.success('Lead updated successfully');
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error(error.response?.data?.message || 'Failed to update lead');
    } finally {
      setIsUpdating(false);
    }
  };

  const openReassignModal = (lead) => {
    setLeadToReassign(lead);
    setShowReassignModal(true);
  };

  const closeReassignModal = () => {
    setShowReassignModal(false);
    setLeadToReassign(null);
  };

  const handleLeadReassigned = (updatedLead) => {
    if (updatedLead?._id) {
      setLeads(prev => prev.map(l => l._id === updatedLead._id ? updatedLead : l));
    }
    closeReassignModal();
  };

  // Load leads when tab is selected
  useEffect(() => {
    if (activeTab === 'lead-tracking') {
      fetchLeads();
    }
  }, [activeTab, fetchLeads]);

  // Simple refresh listener for socket events
  useEffect(() => {
    const handleRefreshLeads = () => {
      if (activeTab === 'lead-tracking') {
        fetchLeads();
      }
    };

    // Listen for the custom event dispatched by SocketContext
    window.addEventListener('refreshLeads', handleRefreshLeads);

    return () => {
      window.removeEventListener('refreshLeads', handleRefreshLeads);
    };
  }, [activeTab, fetchLeads]);

  // Export leads function
  const handleExportLeads = async () => {
    try {
      const params = new URLSearchParams();
      
      // Add all current filters as query parameters
      if (leadFilters.search) params.append('search', leadFilters.search);
      if (leadFilters.leadId) params.append('leadId', leadFilters.leadId);
      if (leadFilters.startDate) params.append('startDate', leadFilters.startDate);
      if (leadFilters.endDate) params.append('endDate', leadFilters.endDate);
      if (leadFilters.status) params.append('status', leadFilters.status);
      if (leadFilters.category) params.append('category', leadFilters.category);
      if (leadFilters.qualificationStatus) params.append('qualificationStatus', leadFilters.qualificationStatus);
      if (leadFilters.assignedTo) params.append('assignedTo', leadFilters.assignedTo);
      if (leadFilters.duplicateStatus) params.append('duplicateStatus', leadFilters.duplicateStatus);
      if (leadFilters.organization) params.append('organization', leadFilters.organization);

      const response = await axios.get(`/api/leads/export?${params.toString()}`, {
        responseType: 'blob'
      });

      // Create blob and download
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with current date
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      link.download = `leads-export-${dateStr}.csv`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Leads exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export leads');
    }
  };

  // Debt types mapping
  const DEBT_TYPES_BY_CATEGORY = {
    secured: [
      'Mortgage Loans',
      'Auto Loans',
      'Secured Personal Loans',
      'Home Equity Loans',
      'Title Loans'
    ],
    unsecured: [
      'Credit Cards',
      'Instalment Loans (Unsecured)',
      'Medical Bills',
      'Utility Bills',
      'Payday Loans',
      'Student Loans (private loan)',
      'Store/Charge Cards',
      'Overdraft Balances',
      'Business Loans (unsecured)',
      'Collection Accounts'
    ]
  };

  const CREDIT_SCORE_RANGES = ['300-549', '550-649', '650-699', '700-749', '750-850'];

  // ── Lead View/Edit modal helpers (ported from AdminDashboard's lead modal) ──
  const leadProgressOptions = [
    'SALE',
    'Callback Needed',
    'Existing Client',
    'Unacceptable Creditors',
    'Not Serviceable State',
    'Sale Long Play',
    'DO NOT CALL - Litigator',
    'DO NOT CALL',
    'Hang-up',
    'Not Interested',
    'No Answer',
    'AIP Client',
    'Not Qualified',
    'Affordability',
    'Others'
  ];

  const formatDraftDate = (dateValue) => formatDateAsDDMMYYYY(dateValue) || '—';

  const formatDisposedByLabel = (disposedBy) => {
    if (!disposedBy) return '—';
    if (typeof disposedBy === 'string') return disposedBy;
    if (disposedBy.name) return disposedBy.name;
    if (disposedBy.email) return disposedBy.email;
    if (disposedBy._id) return disposedBy._id;
    return '—';
  };

  const getCategoryBadge = (category, completionPercentage = 0) => {
    if (!category) return <span className="text-sm text-gray-500">—</span>;
    const badges = {
      hot: 'bg-red-100 text-red-800 border-red-200',
      warm: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      cold: 'bg-blue-100 text-blue-800 border-blue-200'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badges[category] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
        {category.charAt(0).toUpperCase() + category.slice(1)} ({completionPercentage}%)
      </span>
    );
  };

  const getQualificationBadge = (qualificationStatus) => {
    const badges = {
      qualified: 'bg-green-100 text-green-800 border-green-200',
      'not-qualified': 'bg-red-100 text-red-800 border-red-200',
      disqualified: 'bg-red-100 text-red-800 border-red-200',
      unqualified: 'bg-red-100 text-red-800 border-red-200',
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    };

    const icons = {
      qualified: CheckCircle,
      'not-qualified': XCircle,
      disqualified: XCircle,
      unqualified: XCircle,
      pending: Clock
    };

    const Icon = icons[qualificationStatus] || Clock;

    const labels = {
      qualified: 'Qualified',
      'not-qualified': 'Not - Qualified',
      disqualified: 'Not - Qualified',
      unqualified: 'Not - Qualified',
      pending: 'Pending'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badges[qualificationStatus] || badges.pending}`}>
        <Icon className="w-3 h-3 mr-1" />
        {labels[qualificationStatus] || 'Pending'}
      </span>
    );
  };

  if (loading) {
    return <LoadingSpinner message="Loading SuperAdmin dashboard..." />;
  }

  const activeUsers = (Array.isArray(admins) ? admins.filter(admin => admin.isActive).length : 0) + 
                     (Array.isArray(agents) ? agents.filter(agent => agent.isActive).length : 0);
  const totalOrganizations = Array.isArray(organizations) ? organizations.length : 0;
  const activeOrganizations = Array.isArray(organizations) ? organizations.filter(org => org.isActive).length : 0;
  const leadStats = {
    totalLeads: dashboardStats?.totalLeads || 0,
    qualifiedLeads: dashboardStats?.qualifiedLeads || 0,
    notQualifiedLeads: dashboardStats?.notQualifiedLeads || 0,
    pendingLeads: dashboardStats?.pendingLeads || 0,
    disposedLeads: dashboardStats?.disposedLeads || 0,
    immediateEnrollmentLeads: dashboardStats?.immediateEnrollmentLeads || 0
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Shield className="h-8 w-8 text-purple-600 mr-3" />
            SuperAdmin Dashboard
          </h1>
          <p className="text-gray-600">Manage organizations, administrators and system users</p>
        </div>
        <button
          onClick={() => setShowManageVendorsModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-sky-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:scale-105 transition-all duration-200 flex items-center gap-1.5"
        >
          <Tags size={16} />
          Manage Lead Vendors
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <BarChart3 className="h-4 w-4 inline mr-2" />
            System Overview
          </button>
          <button
            onClick={() => setActiveTab('lead-tracking')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'lead-tracking'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="h-4 w-4 inline mr-2" />
            Lead Tracking
          </button>
          <button
            onClick={() => setActiveTab('organizations')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'organizations'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Building2 className="h-4 w-4 inline mr-2" />
            Organizations
          </button>
          <button
            onClick={() => setActiveTab('user-management')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'user-management'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Users className="h-4 w-4 inline mr-2" />
            User Management
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <Building2 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Organizations</p>
                  <p className="text-2xl font-bold text-gray-900">{totalOrganizations}</p>
                  <p className="text-xs text-green-600">{activeOrganizations} active</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Admins</p>
                  <p className="text-2xl font-bold text-gray-900">{Array.isArray(admins) ? admins.length : 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Agents</p>
                  <p className="text-2xl font-bold text-gray-900">{Array.isArray(agents) ? agents.length : 0}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100">
                  <UserCheck className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{activeUsers}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Lead Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Leads</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadStats.totalLeads}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Qualified</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadStats.qualifiedLeads}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Not Qualified</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadStats.notQualifiedLeads}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadStats.pendingLeads}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Disposed</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadStats.disposedLeads}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sale</p>
              </div>
              <p className="text-2xl font-bold text-gray-900 mt-1">{leadStats.immediateEnrollmentLeads}</p>
            </div>
          </div>

          {/* Admins Management */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Administrator Management</h3>
              </div>
              
              {/* Admin Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search admins by name or email..."
                    value={adminFilters.search}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                
                <div>
                  <select
                    value={adminFilters.organization}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, organization: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Organizations</option>
                    {organizations.map(org => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={adminFilters.status}
                    onChange={(e) => setAdminFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                      S.No
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Admin Info
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(admins) && admins.map((admin, index) => (
                    <tr key={admin._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{admin.name}</div>
                          <div className="text-sm text-gray-500">{admin.email}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.role === 'restricted_admin' ? 'bg-orange-100 text-orange-800' :
                          admin.role === 'affiliate_admin' ? 'bg-amber-100 text-amber-800' :
                          admin.role === 'multivendor_admin' ? 'bg-cyan-100 text-cyan-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {admin.role === 'restricted_admin' ? 'Restricted Admin' :
                           admin.role === 'affiliate_admin' ? 'Affiliate Admin' :
                           admin.role === 'multivendor_admin' ? 'Multi Vendor Admin' : 'Admin'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          admin.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {admin.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatEasternTimeForDisplay(admin.createdAt, { includeTime: false })}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-3">
                          {/* Slider Toggle */}
                          <div className="flex items-center">
                            <label className="inline-flex relative items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={admin.isActive}
                                onChange={() => handleToggleAdminStatus(admin._id, admin.isActive)}
                                className="sr-only peer"
                              />
                              <div className={`relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer ${
                                admin.isActive 
                                  ? 'peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600' 
                                  : 'after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all bg-gray-200'
                              }`}>
                              </div>
                              <span className={`ml-2 text-xs font-medium ${admin.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                {admin.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          </div>

                          <button
                            onClick={() => handleDeleteAdmin(admin._id, admin.name)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!Array.isArray(admins) || admins.length === 0) && (
                    <tr>
                      <td colSpan="6" className="px-4 py-6 text-center text-gray-500">
                        No administrators found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agents Overview */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Agents Overview</h3>
              </div>
              
              {/* Agent Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search agents by name or email..."
                    value={agentFilters.search}
                    onChange={(e) => setAgentFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                
                <div>
                  <select
                    value={agentFilters.organization}
                    onChange={(e) => setAgentFilters(prev => ({ ...prev, organization: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Organizations</option>
                    {organizations.map(org => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <select
                    value={agentFilters.status}
                    onChange={(e) => setAgentFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                      S.No
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent Info
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Array.isArray(agents) && agents.map((agent, index) => (
                    <tr key={agent._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                        {index + 1}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                          <div className="text-sm text-gray-500">{agent.email}</div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          agent.role === 'agent1' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {agent.role === 'agent1' ? 'Agent 1' : 'Agent 2'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          agent.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {agent.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(agent.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-3">
                          {/* Slider Toggle */}
                          <div className="flex items-center">
                            <label className="inline-flex relative items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={agent.isActive}
                                onChange={() => handleToggleAgentStatus(agent._id, agent.isActive)}
                                className="sr-only peer"
                              />
                              <div className={`relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer ${
                                agent.isActive 
                                  ? 'peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600' 
                                  : 'after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all bg-gray-200'
                              }`}>
                              </div>
                              <span className={`ml-2 text-xs font-medium ${agent.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                                {agent.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </label>
                          </div>

                          <button
                            onClick={() => handleDeleteAgent(agent._id, agent.name)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!Array.isArray(agents) || agents.length === 0) && (
                    <tr>
                      <td colSpan="6" className="px-4 py-6 text-center text-gray-500">
                        No agents found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <OrganizationManagement />
      )}

      {/* User Management Tab */}
      {activeTab === 'user-management' && (
        <SuperAdminUserManagement />
      )}

      {/* Lead Tracking Tab Content */}
      {activeTab === 'lead-tracking' && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-semibold text-gray-900">Lead Tracking</h2>
              </div>
              <button
                onClick={() => setShowLeadModal(true)}
                className="flex items-center space-x-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Lead</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          
          {/* Duplicate Status Filter Buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setLeadFilters({...leadFilters, duplicateStatus: ''})}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                leadFilters.duplicateStatus === '' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All Leads
            </button>
            <button
              onClick={() => setLeadFilters({...leadFilters, duplicateStatus: 'duplicates'})}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                leadFilters.duplicateStatus === 'duplicates' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              🔄 Duplicate Leads
            </button>
            <button
              onClick={() => setLeadFilters({...leadFilters, duplicateStatus: 'non-duplicates'})}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                leadFilters.duplicateStatus === 'non-duplicates' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              ✅ Unique Leads
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search leads..."
                value={leadFilters.search}
                onChange={(e) => setLeadFilters({...leadFilters, search: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            {/* Lead ID Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Lead ID..."
                value={leadFilters.leadId}
                onChange={(e) => setLeadFilters({...leadFilters, leadId: e.target.value})}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            {/* Date Range */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                placeholder="Start Date"
                value={leadFilters.startDate}
                onChange={(e) => setLeadFilters({...leadFilters, startDate: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="date"
                placeholder="End Date"
                value={leadFilters.endDate}
                onChange={(e) => setLeadFilters({...leadFilters, endDate: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={leadFilters.status}
                onChange={(e) => setLeadFilters({...leadFilters, status: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              >
                <option value="">All Status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            {/* Qualification Status Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={leadFilters.qualificationStatus}
                onChange={(e) => setLeadFilters({...leadFilters, qualificationStatus: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              >
                <option value="">All Qualification</option>
                <option value="qualified">Qualified</option>
                <option value="not-qualified">Not - Qualified</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {/* Organization Filter */}
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={leadFilters.organization}
                onChange={(e) => setLeadFilters({...leadFilters, organization: e.target.value})}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 w-full"
              >
                <option value="">All Organizations</option>
                {organizations.map(org => (
                  <option key={org._id} value={org._id}>{org.name}</option>
                ))}
              </select>
            </div>

            {/* Clear Filters and Export */}
            <div className="flex space-x-2">
              <button
                onClick={() => setLeadFilters({
                  search: '',
                  leadId: '',
                  startDate: '',
                  endDate: '',
                  status: '',
                  category: '',
                  qualificationStatus: '',
                  assignedTo: '',
                  duplicateStatus: '',
                  organization: ''
                })}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Clear Filters
              </button>
              
              <button
                onClick={handleExportLeads}
                className="px-4 py-2 bg-green-600 text-white border border-green-600 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Leads Table */}
          <div className="overflow-x-auto">
            {leadsLoading ? (
              <div className="flex justify-center items-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Info</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debt Details</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duplicate</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                        No leads found
                      </td>
                    </tr>
                  ) : (
                    leads.map((lead) => (
                      <tr key={lead._id || lead.leadId} className="hover:bg-gray-50">
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{lead.name}</div>
                            <div className="text-sm text-gray-500">ID: {lead.leadId}</div>
                            {lead.assignedAgent && (
                              <div className="text-xs text-indigo-600">Agent: {lead.assignedAgent}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {lead.email && <div>{lead.email}</div>}
                            {lead.phone && <div>{lead.phone}</div>}
                            {lead.city && lead.state && (
                              <div className="text-xs text-gray-500">{lead.city}, {lead.state}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {lead.organization?.name || 'Unknown'}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            <div>{lead.debtCategory || 'N/A'}</div>
                            {lead.totalDebtAmount && (
                              <div className="text-xs text-gray-600">
                                ${Number(lead.totalDebtAmount).toLocaleString()}
                              </div>
                            )}
                            {lead.creditScoreRange && (
                              <div className="text-xs text-gray-500">
                                Credit: {lead.creditScoreRange}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            lead.status === 'new' ? 'bg-blue-100 text-blue-800' :
                            lead.status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                            lead.status === 'qualified' ? 'bg-purple-100 text-purple-800' :
                            lead.status === 'converted' ? 'bg-green-100 text-green-800' :
                            lead.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {lead.status || 'new'}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {lead.isDuplicate ? (
                            <div>
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                🔄 Duplicate
                              </span>
                              {lead.duplicateReason && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Phone Match
                                </div>
                              )}
                              {lead.duplicateOf && (
                                <div className="text-xs text-blue-600 mt-1">
                                  Original: {lead.duplicateOf.leadId || lead.duplicateOf}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              ✅ Unique
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                          <div>{formatEasternTimeForDisplay(lead.createdAt, { includeTime: false })}</div>
                          <div className="text-xs text-gray-400">
                            {formatEasternTimeForDisplay(lead.createdAt, { includeTime: true, timeOnly: true })}
                          </div>
                          {lead.lastUpdatedBy && (
                            <div className="text-xs text-gray-400 mt-1">
                              Updated by: {lead.lastUpdatedBy}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => openViewModal(lead)}
                              title="View / Edit Lead"
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openReassignModal(lead)}
                              title="Reassign to Agent"
                              className="text-purple-600 hover:text-purple-900"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteLead(lead.leadId || lead._id, lead.name)}
                              title="Delete Lead"
                              className="text-red-600 hover:text-red-900"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Pagination for leads */}
          {pagination.total > 0 && (
            <div className="mt-6 px-6 pb-6">
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.pages}
                totalItems={pagination.total}
                itemsPerPage={pagination.limit}
                onPageChange={handlePageChange}
                className="border-t border-gray-200 pt-4"
              />
            </div>
          )}
        </div>
      )}

      {/* Create Lead Modal */}
      {showLeadModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div 
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={() => setShowLeadModal(false)}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <form onSubmit={handleCreateLead}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Create New Lead</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900 border-b pb-2">Personal Information</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name *</label>
                        <input
                          type="text"
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.name}
                          onChange={(e) => setLeadFormData({...leadFormData, name: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Organization *</label>
                        <select
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.organization}
                          onChange={(e) => setLeadFormData({...leadFormData, organization: e.target.value})}
                        >
                          <option value="">Select Organization</option>
                          {organizations.map(org => (
                            <option key={org._id} value={org._id}>{org.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.email}
                          onChange={(e) => setLeadFormData({...leadFormData, email: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                        <input
                          type="tel"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.phone}
                          onChange={(e) => setLeadFormData({...leadFormData, phone: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Alternate Phone</label>
                        <input
                          type="tel"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.alternatePhone}
                          onChange={(e) => setLeadFormData({...leadFormData, alternatePhone: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.address}
                          onChange={(e) => setLeadFormData({...leadFormData, address: e.target.value})}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">City</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            value={leadFormData.city}
                            onChange={(e) => setLeadFormData({...leadFormData, city: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">State</label>
                          <input
                            type="text"
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            value={leadFormData.state}
                            onChange={(e) => setLeadFormData({...leadFormData, state: e.target.value})}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                        <input
                          type="text"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.zipcode}
                          onChange={(e) => setLeadFormData({...leadFormData, zipcode: e.target.value})}
                        />
                      </div>
                    </div>

                    {/* Debt Information */}
                    <div className="space-y-4">
                      <h4 className="font-medium text-gray-900 border-b pb-2">Debt Information</h4>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Category</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.debtCategory}
                          onChange={(e) => setLeadFormData({...leadFormData, debtCategory: e.target.value, debtTypes: []})}
                        >
                          <option value="unsecured">Unsecured</option>
                          <option value="secured">Secured</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Debt Types</label>
                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3">
                          {DEBT_TYPES_BY_CATEGORY[leadFormData.debtCategory].map((type) => (
                            <label key={type} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={leadFormData.debtTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setLeadFormData({
                                      ...leadFormData,
                                      debtTypes: [...leadFormData.debtTypes, type]
                                    });
                                  } else {
                                    setLeadFormData({
                                      ...leadFormData,
                                      debtTypes: leadFormData.debtTypes.filter(t => t !== type)
                                    });
                                  }
                                }}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              />
                              <span className="ml-2 text-sm text-gray-700">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Total Debt Amount ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.totalDebtAmount}
                          onChange={(e) => setLeadFormData({...leadFormData, totalDebtAmount: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Number of Creditors</label>
                        <input
                          type="number"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.numberOfCreditors}
                          onChange={(e) => setLeadFormData({...leadFormData, numberOfCreditors: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Monthly Debt Payment ($)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.monthlyDebtPayment}
                          onChange={(e) => setLeadFormData({...leadFormData, monthlyDebtPayment: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Credit Score Range</label>
                        <select
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.creditScoreRange}
                          onChange={(e) => setLeadFormData({...leadFormData, creditScoreRange: e.target.value})}
                        >
                          <option value="">Select Credit Score Range</option>
                          {CREDIT_SCORE_RANGES.map((range) => (
                            <option key={range} value={range}>{range}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                          rows={3}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          value={leadFormData.notes}
                          onChange={(e) => setLeadFormData({...leadFormData, notes: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {submitting ? 'Creating...' : 'Create Lead'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => setShowLeadModal(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Lead View/Edit Modal — full detail parity with the main-org admin dashboard */}
      {showViewModal && selectedLead && editedLead && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div
                className="absolute inset-0 bg-gray-500 opacity-75"
                onClick={closeViewModal}
              ></div>
            </div>

            <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full">
              <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      {isEditing ? 'Edit Lead' : 'Lead Details'}: {selectedLead.name}
                    </h3>
                    <p className="text-indigo-100 text-sm">
                      {isEditing ? 'Modify lead information and status' : 'Complete lead information and tracking'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={handleLeadUpdate}
                          disabled={isUpdating}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" />
                          {isUpdating ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleEditToggle}
                        className="flex items-center gap-1 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                      >
                        <Edit3 className="h-4 w-4" />
                        Edit
                      </button>
                    )}
                    <button
                      onClick={closeViewModal}
                      className="text-white hover:text-indigo-200 transition-colors"
                    >
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white px-6 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Personal Information */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-5 rounded-xl border border-gray-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-blue-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Personal Information</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Name:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.name || ''}
                            onChange={(e) => handleInputChange('name', e.target.value)}
                            className="text-sm text-gray-900 font-medium text-right border border-gray-300 rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 font-medium text-right">{selectedLead.name || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Email:</span>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editedLead.email || ''}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-40"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right break-all">{selectedLead.email || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Phone:</span>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editedLead.phone || ''}
                            onChange={(e) => handleInputChange('phone', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.phone || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Alt. Phone:</span>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editedLead.alternatePhone || ''}
                            onChange={(e) => handleInputChange('alternatePhone', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.alternatePhone || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Lead Vendor:</span>
                        {isEditing ? (
                          <select
                            value={editedLead.leadVendor || ''}
                            onChange={(e) => handleInputChange('leadVendor', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                          >
                            <option value="">—</option>
                            {leadVendorOptions.map(opt => (
                              <option key={opt._id} value={opt.name}>{opt.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.leadVendor || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Address Information */}
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-xl border border-green-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-green-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Address Information</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Address:</span>
                        {isEditing ? (
                          <textarea
                            value={editedLead.address || ''}
                            onChange={(e) => handleInputChange('address', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-40 h-16 resize-none"
                            placeholder="Enter address"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right max-w-xs">{selectedLead.address || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">City:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.city || ''}
                            onChange={(e) => handleInputChange('city', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="Enter city"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.city || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">State:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.state || ''}
                            onChange={(e) => handleInputChange('state', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-24"
                            placeholder="Enter state"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.state || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Zipcode:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.zipcode || ''}
                            onChange={(e) => handleInputChange('zipcode', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-24"
                            placeholder="Enter zipcode"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.zipcode || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Debt Information */}
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-xl border border-purple-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-purple-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Debt Information</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Category:</span>
                        {isEditing ? (
                          <select
                            value={editedLead.debtCategory || ''}
                            onChange={(e) => handleInputChange('debtCategory', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
                          >
                            <option value="">Select</option>
                            <option value="secured">Secured</option>
                            <option value="unsecured">Unsecured</option>
                          </select>
                        ) : (
                          <span className="text-sm text-gray-900 text-right capitalize">{selectedLead.debtCategory || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Source:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.source || ''}
                            onChange={(e) => handleInputChange('source', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="Lead source"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.source || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Total Amount:</span>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editedLead.totalDebtAmount || ''}
                            onChange={(e) => handleInputChange('totalDebtAmount', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right font-semibold">
                            {selectedLead.totalDebtAmount ? `$${Number(selectedLead.totalDebtAmount).toLocaleString()}` : '—'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Creditors:</span>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editedLead.numberOfCreditors || ''}
                            onChange={(e) => handleInputChange('numberOfCreditors', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-20"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.numberOfCreditors || '—'}</span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Monthly Payment:</span>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editedLead.monthlyDebtPayment || ''}
                            onChange={(e) => handleInputChange('monthlyDebtPayment', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">
                            {selectedLead.monthlyDebtPayment ? `$${Number(selectedLead.monthlyDebtPayment).toLocaleString()}` : '—'}
                          </span>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Credit Score:</span>
                        {isEditing ? (
                          <select
                            value={editedLead.creditScoreRange || ''}
                            onChange={(e) => handleInputChange('creditScoreRange', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                          >
                            <option value="">Select Range</option>
                            {CREDIT_SCORE_RANGES.map((range) => (
                              <option key={range} value={range}>{range}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.creditScoreRange || '—'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-gradient-to-br from-indigo-50 to-indigo-100 p-5 rounded-xl border border-indigo-200">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">GTI Workflow Snapshot</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-600">Disposition Status:</span>
                      <p className={`mt-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${selectedLead.isDisposed ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {selectedLead.isDisposed ? 'Disposed' : 'Active'}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Disposition Reason:</span>
                      <p className="mt-1 text-sm text-gray-900 break-words">{selectedLead.disposition1 || '—'}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Disposed By:</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDisposedByLabel(selectedLead.disposedBy)}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-600">Draft Date:</span>
                      <p className="mt-1 text-sm text-gray-900">{formatDraftDate(selectedLead.draftDate)}</p>
                    </div>
                  </div>
                </div>

                {/* Management & Status Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                  {/* Management Information */}
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-5 rounded-xl border border-orange-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-orange-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Management Info</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Organization:</span>
                        <span className="text-sm text-gray-900 text-right font-medium">{selectedLead.organization?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Created By:</span>
                        <span className="text-sm text-gray-900 text-right font-medium">{selectedLead.createdBy?.name || '—'}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Created At:</span>
                        <span className="text-sm text-gray-900 text-right">
                          {selectedLead.createdAt ? new Date(selectedLead.createdAt).toLocaleDateString() : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Category:</span>
                        {isEditing ? (
                          <select
                            value={editedLead.category || ''}
                            onChange={(e) => handleInputChange('category', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
                          >
                            <option value="">Select</option>
                            <option value="hot">Hot</option>
                            <option value="warm">Warm</option>
                            <option value="cold">Cold</option>
                          </select>
                        ) : (
                          <div className="text-right">{getCategoryBadge(selectedLead.category, selectedLead.completionPercentage)}</div>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Qualification:</span>
                        {isEditing ? (
                          <div className="text-right">
                            <select
                              value={editedLead.qualificationStatus || ''}
                              onChange={(e) => handleInputChange('qualificationStatus', e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                            >
                              <option value="">Select Status</option>
                              <option value="qualified">Qualified</option>
                              <option value="not-qualified">Not - Qualified</option>
                              <option value="pending">Pending</option>
                            </select>
                            <div className="text-xs text-blue-600 italic mt-1">Independent from Lead Progress</div>
                          </div>
                        ) : (
                          <div className="text-right">{getQualificationBadge(selectedLead.qualificationStatus)}</div>
                        )}
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Company:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.company || ''}
                            onChange={(e) => handleInputChange('company', e.target.value)}
                            className="text-sm text-gray-900 text-right border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="Company name"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">{selectedLead.company || '—'}</span>
                        )}
                      </div>
                      {selectedLead.lastUpdatedBy && (
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Updated By:</span>
                          <span className="text-sm text-green-700 text-right font-medium">{selectedLead.lastUpdatedBy}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Agent2 Status Tracking */}
                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-5 rounded-xl border border-teal-200">
                    <div className="flex items-center mb-4">
                      <div className="p-2 bg-teal-100 rounded-lg mr-3">
                        <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-semibold text-gray-800">Agent2 Actions & Status</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white p-3 rounded-lg border border-teal-200">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Lead Progress Status:</span>
                          {isEditing ? (
                            <select
                              value={editedLead.leadProgressStatus || ''}
                              onChange={(e) => handleInputChange('leadProgressStatus', e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 w-48"
                            >
                              <option value="">Select Status</option>
                              {leadProgressOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            selectedLead.leadProgressStatus ? (
                              <span className="text-sm bg-teal-100 text-teal-800 px-2 py-1 rounded-full font-medium text-right max-w-xs">
                                {selectedLead.leadProgressStatus}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-500 italic">No status update yet</span>
                            )
                          )}
                        </div>
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Follow-up Date:</span>
                        {isEditing ? (
                          <input
                            type="date"
                            value={editedLead.followUpDate ? new Date(editedLead.followUpDate).toISOString().split('T')[0] : ''}
                            onChange={(e) => handleInputChange('followUpDate', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">
                            {selectedLead.followUpDate ? new Date(selectedLead.followUpDate).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Follow-up Time:</span>
                        {isEditing ? (
                          <input
                            type="time"
                            value={editedLead.followUpTime || ''}
                            onChange={(e) => handleInputChange('followUpTime', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 text-right">
                            {selectedLead.followUpTime || '—'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Client ID:</span>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedLead.clientId || ''}
                            onChange={(e) => handleInputChange('clientId', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-40 font-mono"
                            placeholder="e.g. ABC123"
                          />
                        ) : (
                          <span className="text-sm text-green-700 font-mono font-semibold text-right">
                            {selectedLead.clientId || '—'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-gray-600">Conversion Value:</span>
                        {isEditing ? (
                          <input
                            type="number"
                            value={editedLead.conversionValue || ''}
                            onChange={(e) => handleInputChange('conversionValue', e.target.value)}
                            className="text-sm border border-gray-300 rounded px-2 py-1 w-32"
                            placeholder="0"
                          />
                        ) : (
                          <span className="text-sm text-green-600 text-right font-semibold">
                            {selectedLead.conversionValue ? `$${Number(selectedLead.conversionValue).toLocaleString()}` : '—'}
                          </span>
                        )}
                      </div>

                      {selectedLead.lastUpdatedBy && (
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Last Updated By:</span>
                          <span className="text-sm text-teal-700 text-right font-medium">{selectedLead.lastUpdatedBy}</span>
                        </div>
                      )}

                      {selectedLead.lastUpdatedAt && (
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-600">Last Updated At:</span>
                          <span className="text-sm text-gray-900 text-right">
                            {formatEasternTimeForDisplay(selectedLead.lastUpdatedAt)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes & Comments Section */}
                <div className="mt-6">
                  <div className="bg-gradient-to-r from-gray-100 to-gray-200 p-4 rounded-xl">
                    <h4 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <svg className="h-5 w-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Notes & Comments
                    </h4>

                    <div className="space-y-4">
                      {/* Agent1 Notes */}
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                        <div className="flex items-center mb-2">
                          <span className="text-sm font-semibold text-blue-800">Agent1 Notes:</span>
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editedLead.notes || ''}
                            onChange={(e) => handleInputChange('notes', e.target.value)}
                            className="w-full text-sm text-gray-900 border border-blue-300 rounded px-3 py-2 h-20 resize-none"
                            placeholder="Enter Agent1 notes..."
                          />
                        ) : (
                          <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.notes || 'No notes available'}</p>
                        )}
                      </div>

                      {/* Assignment Notes */}
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                        <div className="flex items-center mb-2">
                          <span className="text-sm font-semibold text-purple-800">Assignment Notes:</span>
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editedLead.assignmentNotes || ''}
                            onChange={(e) => handleInputChange('assignmentNotes', e.target.value)}
                            className="w-full text-sm text-gray-900 border border-purple-300 rounded px-3 py-2 h-20 resize-none"
                            placeholder="Enter assignment notes..."
                          />
                        ) : (
                          <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.assignmentNotes || 'No assignment notes available'}</p>
                        )}
                      </div>

                      {/* Agent2 Follow-up Notes */}
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <div className="flex items-center mb-2">
                          <span className="text-sm font-semibold text-green-800">Agent2 Follow-up Notes:</span>
                        </div>
                        {isEditing ? (
                          <textarea
                            value={editedLead.followUpNotes || ''}
                            onChange={(e) => handleInputChange('followUpNotes', e.target.value)}
                            className="w-full text-sm text-gray-900 border border-green-300 rounded px-3 py-2 h-20 resize-none"
                            placeholder="Enter follow-up notes..."
                          />
                        ) : (
                          <p className="text-sm text-gray-900 leading-relaxed">{selectedLead.followUpNotes || 'No follow-up notes available'}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-3 flex justify-end">
                <button
                  onClick={closeViewModal}
                  className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LeadReassignModal
        isOpen={showReassignModal}
        onClose={closeReassignModal}
        lead={leadToReassign}
        onLeadReassigned={handleLeadReassigned}
      />

      <LeadVendorOptionsModal
        isOpen={showManageVendorsModal}
        onClose={() => setShowManageVendorsModal(false)}
      />
    </div>
  );
};

export default SuperAdminDashboard;

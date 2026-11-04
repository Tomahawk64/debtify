import React, { useState, useEffect } from 'react';
import { Users, UserPlus, ToggleLeft, ToggleRight, Eye, EyeOff, Trash2, Edit3, Save, X, Key, Phone } from 'lucide-react';
import axios from '../utils/axios';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';
import CreateAgentModal from './CreateAgentModal';

// Roles routed through the /api/auth/admins/* endpoints (as opposed to
// /agents or /data-vendors) for status toggling, editing, and deletion.
const ADMIN_BUCKET_ROLES = ['admin', 'restricted_admin', 'affiliate_admin', 'multivendor_admin'];
const isAdminBucketRole = (role) => ADMIN_BUCKET_ROLES.includes(role);

const SuperAdminUserManagement = () => {
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Edit user states
  const [editingUser, setEditingUser] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    password: '',
    showPasswordField: false,
    vicidialAgentId: '',
    subLeadVendors: [],
    canExportLeads: false
  });
  const [isUpdating, setIsUpdating] = useState(false);

  // Active Lead Vendor options — used to edit a multivendor_admin's scope.
  const [leadVendorOptions, setLeadVendorOptions] = useState([]);

  // Filter state
  const [roleFilter, setRoleFilter] = useState('all'); // 'all', 'agent1', 'agent2', 'admin'

  useEffect(() => {
    fetchUsers();
    fetchOrganizations();
    axios.get('/api/lead-vendor-options')
      .then(res => { if (res.data?.success) setLeadVendorOptions(res.data.data || []); })
      .catch(() => {});
  }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get('/api/organizations');
      setOrganizations(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (error) {
      console.error('Fetch organizations error:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      // Fetch agents, admins, and data vendors
      const [agentsResponse, adminsResponse, vendorsResponse] = await Promise.all([
        axios.get('/api/auth/agents'),
        axios.get('/api/auth/admins'),
        axios.get('/api/auth/data-vendors')
      ]);
      
      const allUsers = [
        ...(Array.isArray(agentsResponse.data.data) ? agentsResponse.data.data : []),
        ...(Array.isArray(adminsResponse.data.data) ? adminsResponse.data.data : []),
        ...(Array.isArray(vendorsResponse.data.data) ? vendorsResponse.data.data : [])
      ];
      
      setUsers(allUsers);
    } catch (error) {
      const message = error.response?.data?.message || 'Error fetching users';
      toast.error(message);
      console.error('Fetch users error:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUserCreated = (newUser) => {
    setUsers(prev => [...prev, newUser]);
    toast.success('User created successfully!');
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const targetUser = users.find(u => u._id === userId);
      let endpoint;
      if (targetUser.role === 'data_vendor') {
        endpoint = 'data-vendors';
      } else if (isAdminBucketRole(targetUser.role)) {
        endpoint = 'admins';
      } else {
        endpoint = 'agents';
      }

      const response = await axios.put(`/api/auth/${endpoint}/${userId}/status`, {
        isActive: !currentStatus
      });

      // Update local state
      setUsers(prev => prev.map(user =>
        user._id === userId
          ? { ...user, isActive: !currentStatus }
          : user
      ));

      toast.success(response.data.message);
    } catch (error) {
      const message = error.response?.data?.message || 'Error updating user status';
      toast.error(message);
      console.error('Toggle user status error:', error);
    }
  };

  // Edit user functions
  const startEditUser = (targetUser) => {
    setEditingUser(targetUser._id);
    setEditFormData({
      name: targetUser.name,
      email: targetUser.email,
      password: '',
      showPasswordField: false,
      vicidialAgentId: targetUser.vicidialAgentId || '',
      subLeadVendors: Array.isArray(targetUser.subLeadVendors) ? [...targetUser.subLeadVendors] : [],
      canExportLeads: !!targetUser.canExportLeads
    });
  };

  const cancelEditUser = () => {
    setEditingUser(null);
    setEditFormData({ name: '', email: '', password: '', showPasswordField: false, vicidialAgentId: '', subLeadVendors: [], canExportLeads: false });
  };

  const togglePasswordField = () => {
    setEditFormData(prev => ({
      ...prev,
      showPasswordField: !prev.showPasswordField,
      password: prev.showPasswordField ? '' : prev.password
    }));
  };

  const saveUserChanges = async (userId) => {
    if (!editFormData.name.trim() || !editFormData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }

    if (editFormData.showPasswordField && editFormData.password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    const targetUserData = users.find(u => u._id === userId);

    if (targetUserData && targetUserData.role === 'multivendor_admin' && editFormData.subLeadVendors.length === 0) {
      toast.error('Select at least one lead vendor for a Multi Vendor Admin account');
      return;
    }

    setIsUpdating(true);
    try {
      const updateData = {
        name: editFormData.name.trim(),
        email: editFormData.email.trim()
      };

      // Include vicidialAgentId for agents
      if (targetUserData && ['agent1', 'agent2'].includes(targetUserData.role)) {
        updateData.vicidialAgentId = editFormData.vicidialAgentId.trim();
      }

      // Include subLeadVendors and export permission for multivendor_admin accounts
      if (targetUserData && targetUserData.role === 'multivendor_admin') {
        updateData.subLeadVendors = editFormData.subLeadVendors;
        updateData.canExportLeads = editFormData.canExportLeads;
      }

      // Include password only if it's being changed
      if (editFormData.showPasswordField && editFormData.password.trim()) {
        updateData.password = editFormData.password.trim();
      }

      const response = await axios.put(`/api/auth/users/${userId}`, updateData);

      // Update local state
      setUsers(prev => prev.map(user =>
        user._id === userId
          ? {
              ...user,
              name: editFormData.name.trim(),
              email: editFormData.email.trim(),
              vicidialAgentId: ['agent1', 'agent2'].includes(user.role) ? editFormData.vicidialAgentId.trim() || undefined : user.vicidialAgentId,
              subLeadVendors: user.role === 'multivendor_admin' ? [...editFormData.subLeadVendors] : user.subLeadVendors,
              canExportLeads: user.role === 'multivendor_admin' ? editFormData.canExportLeads : user.canExportLeads
            }
          : user
      ));

      setEditingUser(null);
      setEditFormData({ name: '', email: '', password: '', showPasswordField: false, vicidialAgentId: '', subLeadVendors: [], canExportLeads: false });
      toast.success(response.data.message);
    } catch (error) {
      const message = error.response?.data?.message || 'Error updating user information';
      toast.error(message);
      console.error('Update user error:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteUser = async (userId, userName) => {
    const targetUser = users.find(u => u._id === userId);
    const userType = targetUser.role === 'data_vendor' ? 'data vendor'
                   : isAdminBucketRole(targetUser.role) ? 'admin' : 'agent';
    
    if (!window.confirm(`Are you sure you want to delete ${userType} "${userName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      let endpoint;
      if (targetUser.role === 'data_vendor') {
        endpoint = 'data-vendors';
      } else if (isAdminBucketRole(targetUser.role)) {
        endpoint = 'admins';
      } else {
        endpoint = 'agents';
      }
      await axios.delete(`/api/auth/${endpoint}/${userId}`);
      
      setUsers(prev => prev.filter(user => user._id !== userId));
      toast.success(`${userType} deleted successfully`);
    } catch (error) {
      const message = error.response?.data?.message || `Error deleting ${userType}`;
      toast.error(message);
      console.error('Delete user error:', error);
    }
  };

  // Bulk selection functions
  const handleSelectUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const filteredUserIds = getFilteredUsers().map(user => user._id);
      setSelectedUsers(filteredUserIds);
    } else {
      setSelectedUsers([]);
    }
  };

  const deleteSelectedUsers = async () => {
    if (selectedUsers.length === 0) {
      toast.error('Please select users to delete');
      return;
    }

    const selectedUserNames = users
      .filter(user => selectedUsers.includes(user._id))
      .map(user => `${user.name} (${user.role})`);

    const confirmMessage = `Are you sure you want to delete ${selectedUsers.length} user(s)?\n\n${selectedUserNames.join(', ')}\n\nThis action cannot be undone.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    try {
      // Group deletions by type
      const agentIds = [];
      const adminIds = [];
      const vendorIds = [];
      
      selectedUsers.forEach(userId => {
        const user = users.find(u => u._id === userId);
        if (user.role === 'data_vendor') {
          vendorIds.push(userId);
        } else if (isAdminBucketRole(user.role)) {
          adminIds.push(userId);
        } else {
          agentIds.push(userId);
        }
      });

      // Delete in parallel
      const deletePromises = [
        ...agentIds.map(id => axios.delete(`/api/auth/agents/${id}`)),
        ...adminIds.map(id => axios.delete(`/api/auth/admins/${id}`)),
        ...vendorIds.map(id => axios.delete(`/api/auth/data-vendors/${id}`))
      ];

      await Promise.all(deletePromises);

      // Remove deleted users from the list
      setUsers(prev => prev.filter(user => !selectedUsers.includes(user._id)));
      setSelectedUsers([]);
      toast.success(`Successfully deleted ${selectedUsers.length} user(s)`);
    } catch (error) {
      const message = error.response?.data?.message || 'Error deleting selected users';
      toast.error(message);
      console.error('Bulk delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'agent1':
        return 'bg-blue-100 text-blue-800';
      case 'agent2':
        return 'bg-green-100 text-green-800';
      case 'admin':
        return 'bg-purple-100 text-purple-800';
      case 'restricted_admin':
        return 'bg-orange-100 text-orange-800';
      case 'affiliate_admin':
        return 'bg-indigo-100 text-indigo-800';
      case 'multivendor_admin':
        return 'bg-cyan-100 text-cyan-800';
      case 'data_vendor':
        return 'bg-violet-100 text-violet-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'agent1':
        return 'Lead Entry & Initial Contact';
      case 'agent2':
        return 'Follow-up & Qualification';
      case 'admin':
        return 'System Administration';
      case 'restricted_admin':
        return 'Restricted Data Access';
      case 'affiliate_admin':
        return 'Affiliate Campaign Dashboard';
      case 'multivendor_admin':
        return 'Multi Vendor Lead Dashboard';
      case 'data_vendor':
        return 'ViciDial Data Transparency';
      default:
        return 'Unknown Role';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFilteredUsers = () => {
    if (roleFilter === 'all') {
      return users;
    }
    return users.filter(user => user.role === roleFilter);
  };

  const filteredUsers = getFilteredUsers();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Users className="text-purple-600 mr-3" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Super Admin User Management</h2>
              <p className="text-sm text-gray-600">Manage all agents and admins - including password changes</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <UserPlus size={20} className="mr-2" />
            Create User
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Role Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'all'
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Users ({users.length})
            </button>
            <button
              onClick={() => setRoleFilter('agent1')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'agent1'
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Agent 1 ({users.filter(u => u.role === 'agent1').length})
            </button>
            <button
              onClick={() => setRoleFilter('agent2')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'agent2'
                  ? 'bg-green-100 text-green-700 border border-green-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Agent 2 ({users.filter(u => u.role === 'agent2').length})
            </button>
            <button
              onClick={() => setRoleFilter('admin')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'admin'
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Admins ({users.filter(u => u.role === 'admin').length})
            </button>
            <button
              onClick={() => setRoleFilter('restricted_admin')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'restricted_admin'
                  ? 'bg-orange-100 text-orange-700 border border-orange-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Restricted Admin ({users.filter(u => u.role === 'restricted_admin').length})
            </button>
            <button
              onClick={() => setRoleFilter('affiliate_admin')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'affiliate_admin'
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Affiliate Admin ({users.filter(u => u.role === 'affiliate_admin').length})
            </button>
            <button
              onClick={() => setRoleFilter('multivendor_admin')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'multivendor_admin'
                  ? 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Multi Vendor Admin ({users.filter(u => u.role === 'multivendor_admin').length})
            </button>
            <button
              onClick={() => setRoleFilter('data_vendor')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                roleFilter === 'data_vendor'
                  ? 'bg-violet-100 text-violet-700 border border-violet-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Data Vendor ({users.filter(u => u.role === 'data_vendor').length})
            </button>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="text-center py-8">
            <Users className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
            <p className="text-gray-600 mb-4">
              {roleFilter === 'all' ? "Create your first user account to get started" : `No ${roleFilter} accounts available`}
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Create User
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bulk Actions */}
            {selectedUsers.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-purple-900">
                      {selectedUsers.length} user{selectedUsers.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={() => setSelectedUsers([])}
                      className="text-sm text-purple-600 hover:text-purple-800"
                    >
                      Clear selection
                    </button>
                  </div>
                  <button
                    onClick={deleteSelectedUsers}
                    disabled={isDeleting}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete Selected'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-900">
                      <input
                        type="checkbox"
                        checked={filteredUsers.length > 0 && selectedUsers.length === filteredUsers.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">User</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Vicidial ID</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Role</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Last Login</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Created</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((targetUser) => (
                    <tr key={targetUser._id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(targetUser._id)}
                          onChange={() => handleSelectUser(targetUser._id)}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                      </td>
                      <td className="py-4 px-4">
                        {editingUser === targetUser._id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editFormData.name}
                              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              placeholder="User name"
                            />
                            <input
                              type="email"
                              value={editFormData.email}
                              onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                              placeholder="User email"
                            />
                            {editFormData.showPasswordField && (
                              <input
                                type="password"
                                value={editFormData.password}
                                onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                placeholder="New password (optional)"
                              />
                            )}
                            <button
                              onClick={togglePasswordField}
                              className="flex items-center text-xs text-purple-600 hover:text-purple-800"
                            >
                              <Key size={12} className="mr-1" />
                              {editFormData.showPasswordField ? 'Hide' : 'Change'} Password
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium text-gray-900">{targetUser.name}</div>
                            <div className="text-sm text-gray-600">{targetUser.email}</div>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        {editingUser === targetUser._id && ['agent1', 'agent2'].includes(targetUser.role) ? (
                          <input
                            type="text"
                            value={editFormData.vicidialAgentId}
                            onChange={(e) => setEditFormData({ ...editFormData, vicidialAgentId: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            placeholder="Vicidial Agent ID"
                          />
                        ) : (
                          <div className="flex items-center">
                            {['agent1', 'agent2'].includes(targetUser.role) ? (
                              targetUser.vicidialAgentId ? (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                                  <Phone size={12} className="mr-1" />
                                  {targetUser.vicidialAgentId}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Not mapped</span>
                              )
                            ) : (
                              <span className="text-xs text-gray-400">N/A</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(targetUser.role)}`}>
                          {targetUser.role.toUpperCase()}
                        </span>
                        {editingUser === targetUser._id && targetUser.role === 'multivendor_admin' ? (
                          <div className="mt-1.5">
                            <div className="text-xs font-medium text-gray-700 mb-1">Lead Vendors *</div>
                            {leadVendorOptions.length === 0 ? (
                              <p className="text-xs text-amber-600">No lead vendor options exist yet.</p>
                            ) : (
                              <div className="max-h-32 w-48 overflow-y-auto space-y-1 bg-white rounded-md border border-gray-200 p-1.5">
                                {leadVendorOptions.map(opt => {
                                  const checked = editFormData.subLeadVendors.includes(opt.name);
                                  return (
                                    <label key={opt._id} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50">
                                      <input
                                        type="checkbox"
                                        className="w-3.5 h-3.5 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500 cursor-pointer"
                                        checked={checked}
                                        onChange={(e) => {
                                          const next = e.target.checked
                                            ? [...editFormData.subLeadVendors, opt.name]
                                            : editFormData.subLeadVendors.filter(n => n !== opt.name);
                                          setEditFormData({ ...editFormData, subLeadVendors: next });
                                        }}
                                      />
                                      {opt.name}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer mt-2">
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 cursor-pointer"
                                checked={!!editFormData.canExportLeads}
                                onChange={(e) => setEditFormData({ ...editFormData, canExportLeads: e.target.checked })}
                              />
                              Allow CSV Export
                            </label>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600 mt-1">
                            {getRoleDescription(targetUser.role)}
                            {targetUser.role === 'multivendor_admin' && Array.isArray(targetUser.subLeadVendors) && targetUser.subLeadVendors.length > 0 && (
                              <div className="text-gray-500 mt-0.5" title={targetUser.subLeadVendors.join(', ')}>
                                {targetUser.subLeadVendors.join(', ')}
                              </div>
                            )}
                            {targetUser.role === 'multivendor_admin' && (
                              <div className={`mt-0.5 ${targetUser.canExportLeads ? 'text-emerald-600' : 'text-gray-400'}`}>
                                Export: {targetUser.canExportLeads ? 'Allowed' : 'Off'}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center">
                          {targetUser.isActive ? (
                            <Eye className="text-green-500 mr-2" size={16} />
                          ) : (
                            <EyeOff className="text-red-500 mr-2" size={16} />
                          )}
                          <span className={`text-sm font-medium ${
                            targetUser.isActive ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {targetUser.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-600">
                          {targetUser.lastLogin ? formatDate(targetUser.lastLogin) : 'Never'}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="text-sm text-gray-600">
                          {formatDate(targetUser.createdAt)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          {editingUser === targetUser._id ? (
                            <>
                              <button
                                onClick={() => saveUserChanges(targetUser._id)}
                                disabled={isUpdating}
                                className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
                                title="Save Changes"
                              >
                                <Save size={20} />
                              </button>
                              <button
                                onClick={cancelEditUser}
                                disabled={isUpdating}
                                className="p-2 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                                title="Cancel Edit"
                              >
                                <X size={20} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditUser(targetUser)}
                                className="p-2 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
                                title="Edit User"
                              >
                                <Edit3 size={20} />
                              </button>
                              <button
                                onClick={() => toggleUserStatus(targetUser._id, targetUser.isActive)}
                                className={`p-2 rounded-lg transition-colors ${
                                  targetUser.isActive
                                    ? 'text-red-600 hover:bg-red-50'
                                    : 'text-green-600 hover:bg-green-50'
                                }`}
                                title={targetUser.isActive ? 'Deactivate User' : 'Activate User'}
                              >
                                {targetUser.isActive ? (
                                  <ToggleRight size={20} />
                                ) : (
                                  <ToggleLeft size={20} />
                                )}
                              </button>
                              <button
                                onClick={() => deleteUser(targetUser._id, targetUser.name)}
                                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                                title="Delete User"
                              >
                                <Trash2 size={20} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CreateAgentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onAgentCreated={handleUserCreated}
        organizations={organizations}
      />
    </div>
  );
};

export default SuperAdminUserManagement;

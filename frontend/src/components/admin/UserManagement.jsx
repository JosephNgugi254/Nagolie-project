import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', role: '' });
  const [roleForm, setRoleForm] = useState({ name: '', description: '', menu_items: [] });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, menuRes] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getRoles(),
        adminAPI.getMenuItems()
      ]);
      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setMenuItems(menuRes.data);
    } catch (err) {
      showToast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreateUser = async () => {
    if (!userForm.username || !userForm.email || !userForm.password || !userForm.role) {
      showToast.error('All fields required');
      return;
    }
    try {
      await adminAPI.createUser(userForm);
      showToast.success('User created');
      setShowUserModal(false);
      setUserForm({ username: '', email: '', password: '', role: '' });
      fetchData();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Delete this user?')) {
      try {
        await adminAPI.deleteUser(userId);
        showToast.success('User deleted');
        fetchData();
      } catch (err) {
        showToast.error(err.response?.data?.error || 'Failed to delete user');
      }
    }
  };

  const handleCreateRole = async () => {
    if (!roleForm.name) {
      showToast.error('Role name required');
      return;
    }
    try {
      await adminAPI.createRole(roleForm);
      showToast.success('Role created');
      setShowRoleModal(false);
      setRoleForm({ name: '', description: '', menu_items: [] });
      fetchData();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to create role');
    }
  };

  const handleDeleteRole = async (roleId, roleName) => {
    if (roleName === 'admin' || roleName === 'director') {
      showToast.error('Cannot delete system role');
      return;
    }
    if (window.confirm(`Delete role "${roleName}"?`)) {
      try {
        await adminAPI.deleteRole(roleId);
        showToast.success('Role deleted');
        fetchData();
      } catch (err) {
        showToast.error(err.response?.data?.error || 'Failed to delete role');
      }
    }
  };

  const toggleRoleMenuItem = (menuKey) => {
    setRoleForm(prev => ({
      ...prev,
      menu_items: prev.menu_items.includes(menuKey)
        ? prev.menu_items.filter(k => k !== menuKey)
        : [...prev.menu_items, menuKey]
    }));
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary" /></div>;

  return (
    <div className="content-section">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>User & Role Management</h2>
        <div>
          <button className="btn btn-primary me-2" onClick={() => setShowUserModal(true)}>
            <i className="fas fa-user-plus"></i> Add User
          </button>
          <button className="btn btn-success" onClick={() => setShowRoleModal(true)}>
            <i className="fas fa-tag"></i> Create Role
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="card mb-5">
        <div className="card-header bg-primary text-white">System Users</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td><span className="badge bg-secondary">{u.role}</span></td>
                    <td>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteUser(u.id)}>
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Roles Table */}
      <div className="card">
        <div className="card-header bg-success text-white">Roles & Permissions</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr><th>Role Name</th><th>Description</th><th>Allowed Menus</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.description || '—'}</td>
                    <td>{r.menu_items.join(', ') || 'None'}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteRole(r.id, r.name)}>
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title="Create New User" size="md">
        <div className="mb-3">
          <label>Username *</label>
          <input type="text" className="form-control" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} />
        </div>
        <div className="mb-3">
          <label>Email *</label>
          <input type="email" className="form-control" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} />
        </div>
        <div className="mb-3">
          <label>Password *</label>
          <input type="password" className="form-control" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
        </div>
        <div className="mb-3">
          <label>Role *</label>
          <select className="form-select" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
            <option value="">Select role</option>
            {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
        </div>
        <div className="alert alert-info">User will be created with hashed password.</div>
        <div className="d-flex gap-2">
          <button className="btn btn-primary" onClick={handleCreateUser}>Create User</button>
          <button className="btn btn-secondary" onClick={() => setShowUserModal(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Create Role Modal */}
      <Modal isOpen={showRoleModal} onClose={() => setShowRoleModal(false)} title="Create New Role" size="lg">
        <div className="mb-3">
          <label>Role Name *</label>
          <input type="text" className="form-control" value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} />
        </div>
        <div className="mb-3">
          <label>Description</label>
          <textarea className="form-control" rows="2" value={roleForm.description} onChange={e => setRoleForm({...roleForm, description: e.target.value})} />
        </div>
        <div className="mb-3">
          <label>Menu Items</label>
          <div className="border rounded p-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {menuItems.map(item => (
              <div key={item.key} className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id={`menu-${item.key}`}
                  checked={roleForm.menu_items.includes(item.key)}
                  onChange={() => toggleRoleMenuItem(item.key)}
                />
                <label className="form-check-label" htmlFor={`menu-${item.key}`}>
                  <i className={`fas ${item.icon} me-1`}></i> {item.label}
                </label>
              </div>
            ))}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-success" onClick={handleCreateRole}>Create Role</button>
          <button className="btn btn-secondary" onClick={() => setShowRoleModal(false)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
};

export default UserManagement;
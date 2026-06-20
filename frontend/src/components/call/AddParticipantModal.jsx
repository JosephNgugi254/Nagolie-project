// components/call/AddParticipantModal.jsx
import React, { useState, useEffect } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';

const AddParticipantModal = ({ isOpen, onClose, onAdd, currentParticipants, onlineUsers }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await recoveryAPI.getUsers();
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      const filtered = res.data.filter(u =>
        u.id !== currentUser.id &&
        !currentParticipants.includes(u.id) &&
        onlineUsers.has(u.id)
      );
      setUsers(filtered);
    } catch (err) {
      showToast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = (userId) => {
    onAdd(userId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Add Participant</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <input
              type="text"
              className="form-control mb-3"
              placeholder="Search users…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {loading ? (
              <div className="text-center py-3">Loading…</div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-muted text-center py-3">
                {users.length === 0 ? 'No online users available to add.' : 'No matches found.'}
              </p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {filteredUsers.map(u => (
                  <div key={u.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <div>
                      <strong>{u.username}</strong> <span className="text-muted">({u.role})</span>
                      <span className="badge bg-success ms-2">online</span>
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleAdd(u.id)}
                    >
                      <i className="fas fa-user-plus me-1" /> Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddParticipantModal;
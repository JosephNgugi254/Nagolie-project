// components/call/GroupCallModal.jsx
import React, { useState, useEffect } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';

const GroupCallModal = ({ isOpen, onClose, onStartGroupCall, onlineUsers }) => {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
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
        onlineUsers.has(u.id)
      );
      setUsers(filtered);
    } catch {
      showToast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleStart = () => {
    if (selected.length < 2) {
      showToast.error('Select at least 2 participants');
      return;
    }
    onStartGroupCall(selected);
    onClose();
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Start Group Call</h5>
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
            ) : filtered.length === 0 ? (
              <p className="text-muted text-center py-3">No online users available</p>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {filtered.map(u => (
                  <div key={u.id} className="form-check py-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`gc-${u.id}`}
                      checked={selected.includes(u.id)}
                      onChange={() => toggleSelect(u.id)}
                    />
                    <label className="form-check-label ms-2" htmlFor={`gc-${u.id}`}>
                      <strong>{u.username}</strong> ({u.role})
                    </label>
                  </div>
                ))}
              </div>
            )}
            <small className="text-muted">Select at least 2 participants</small>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={selected.length < 2}
              onClick={handleStart}
            >
              Start Group Call ({selected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupCallModal;
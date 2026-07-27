import { useState, useEffect } from 'react';
import { recoveryAPI, chatAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import Modal from '../common/Modal';

const CreateGroupModal = ({ isOpen, onClose, onGroupCreated }) => {
  const [name, setName] = useState('');
  const [picture, setPicture] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      recoveryAPI.getUsers()
        .then(res => {
          const filtered = res.data.filter(u => u.role !== 'admin' && u.role !== 'investor');
          setUsers(filtered);
        })
        .catch(console.error);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || selectedUsers.length === 0) {
      showToast.error('Group name and at least one member required');
      return;
    }
    setLoading(true);
    try {
      const res = await chatAPI.createGroup({
        name: name.trim(),
        profile_picture: picture,
        participant_ids: selectedUsers
      });
      showToast.success('Group created!');
      onGroupCreated(res.data);
      onClose();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      showToast.error('Image too large (max 1MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPicture(ev.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Group" size="md">
      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label className="form-label">Group Name</label>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="e.g. Team Standup 🚀"
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Profile Picture (optional)</label>
          <input
            type="file"
            accept="image/*"
            className="form-control"
            onChange={handleFileChange}
          />
          {picture && (
            <img
              src={picture}
              alt="preview"
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: '50%', marginTop: 8 }}
            />
          )}
        </div>
        <div className="mb-3">
          <label className="form-label">Select Members</label>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {users.map(u => (
              <div key={u.id} className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  value={u.id}
                  checked={selectedUsers.includes(u.id)}
                  onChange={e => {
                    const id = parseInt(e.target.value);
                    setSelectedUsers(prev =>
                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                    );
                  }}
                />
                <label className="form-check-label">{u.username}</label>
              </div>
            ))}
          </div>
        </div>
        <div className="d-flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Group'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateGroupModal;
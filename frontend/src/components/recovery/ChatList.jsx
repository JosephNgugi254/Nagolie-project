import { useState, useEffect } from 'react';
import { recoveryAPI } from '../../services/api';

function ChatList({ isOpen, onClose, onSelectUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchUnreadCounts();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      const res = await recoveryAPI.getUsers();
      const allowedRoles = ['director', 'secretary', 'accountant', 'valuer', 'head_of_it', 'deputy_director'];
      const filtered = res.data.filter(u => allowedRoles.includes(u.role));
      setUsers(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const res = await recoveryAPI.getUnreadCountByUser();
      setUnreadCounts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUserClick = (user) => {
    onSelectUser(user);
    onClose(); // Always close chat list when a user is selected
  };

  return (
    <div className={`chat-list-panel ${isOpen ? 'open' : ''}`}>
      <div className="chat-list-header">
        <h5 className="mb-0">Inbox</h5>
        <button className="btn-close btn-close-white" onClick={onClose}></button>
      </div>
      <div className="chat-list-body">
        {loading ? (
          <div className="text-center py-3">Loading...</div>
        ) : users.length === 0 ? (
          <p className="text-muted text-center p-3">No users found.</p>
        ) : (
          users.map(user => (
            <div
              key={user.id}
              className={`chat-list-item ${unreadCounts[user.id] > 0 ? 'unread' : ''}`}
              onClick={() => handleUserClick(user)}
            >
              <div className="chat-avatar">
                <i className="fas fa-user-circle"></i>
              </div>
              <div className="chat-info">
                <div className="chat-name">{user.username}</div>
                <div className="chat-role">{user.role}</div>
              </div>
              {unreadCounts[user.id] > 0 && (
                <span className="badge bg-danger rounded-pill">{unreadCounts[user.id]}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ChatList;
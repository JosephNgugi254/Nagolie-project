import { useState, useEffect } from 'react';
import { recoveryAPI, chatAPI } from '../../services/api';
import Avatar from '../common/Avatar';
import Modal from '../common/Modal';
import CreateGroupModal from './CreateGroupModal';

function ChatList({ isOpen, onClose, onSelectUser, onlineUsers = new Set() }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [groupUnreads, setGroupUnreads] = useState({});
  const [previewUser, setPreviewUser] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchUnreadCounts();
      fetchGroups();
      fetchGroupUnreads();
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    try {
      const res = await recoveryAPI.getUsers();
      const allowedRoles = ['director', 'secretary','client_relations_officer', 'accountant', 'valuer', 'head_of_it', 'deputy_director', 'hr_manager'];
      const filtered = res.data.filter(u => allowedRoles.includes(u.role) && u.role !== 'admin' && u.role !== 'investor');
      setUsers(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await chatAPI.getGroups();
      setGroups(res.data);
    } catch (err) {
      console.error(err);
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

  const fetchGroupUnreads = async () => {
    try {
      const res = await chatAPI.getGroupUnreadCounts();
      setGroupUnreads(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAvatarClick = (user, e) => {
    e.stopPropagation();
    setPreviewUser(user);
    setShowPreview(true);
  };

  const handleGroupCreated = (newGroup) => {
    setGroups(prev => [newGroup, ...prev]);
  };

  return (
    <div className={`chat-list-panel ${isOpen ? 'open' : ''}`}>
      <div className="chat-list-header">
        <h5 className="mb-0">Inbox</h5>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-light" onClick={() => setShowCreateGroup(true)}>
            <i className="fas fa-user-plus" /> Group
          </button>
          <button className="btn-close btn-close-white" onClick={onClose}></button>
        </div>
      </div>
      <div className="chat-list-body">
        {loading ? (
          <div className="text-center py-3">Loading...</div>
        ) : (
          <>
            {/* Users */}
            {users.map(user => (
              <div
                key={user.id}
                className={`chat-list-item ${unreadCounts[user.id] > 0 ? 'unread' : ''}`}
                onClick={() => onSelectUser({ type: 'user', data: user })}
              >
                <div className="chat-avatar" onClick={(e) => handleAvatarClick(user, e)}>
                  <Avatar user={user} size={40} />
                </div>
                <div className="chat-info">
                  <div className="chat-name">
                    {user.username}
                    {onlineUsers.has(user.id) && (
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', backgroundColor: '#4caf50', marginLeft: 8, verticalAlign: 'middle' }} title="Online" />
                    )}
                  </div>
                  <div className="chat-role">{user.role}</div>
                </div>
                {unreadCounts[user.id] > 0 && (
                  <span className="badge bg-danger rounded-pill">{unreadCounts[user.id]}</span>
                )}
              </div>
            ))}
            {/* Groups */}
            {groups.map(group => (
              <div
                key={`group-${group.id}`}
                className={`chat-list-item ${groupUnreads[group.id] > 0 ? 'unread' : ''}`}
                onClick={() => onSelectUser({ type: 'group', data: group })}
              >
                <div className="chat-avatar">
                  {group.profile_picture ? (
                    <img src={group.profile_picture} alt={group.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <i className="fas fa-users" style={{ fontSize: 24, color: '#6c757d' }} />
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-name">{group.name}</div>
                  <div className="chat-role">{group.member_count} members</div>
                </div>
                {groupUnreads[group.id] > 0 && (
                  <span className="badge bg-danger rounded-pill">{groupUnreads[group.id]}</span>
                )}
              </div>
            ))}
            {users.length === 0 && groups.length === 0 && (
              <p className="text-muted text-center p-3">No conversations.</p>
            )}
          </>
        )}
      </div>

      {/* Avatar Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        title="Profile Picture"
        size="md"
      >
        {previewUser && (
          <div className="text-center">
            {previewUser.profile_picture ? (
              <img src={previewUser.profile_picture} alt={previewUser.username} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', objectFit: 'contain' }} />
            ) : (
              <div style={{ width: '200px', height: '200px', borderRadius: '50%', backgroundColor: '#e9ecef', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '80px', fontWeight: 'bold', color: '#6c757d' }}>
                {previewUser.username?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <p className="mt-2"><strong>{previewUser.username}</strong></p>
          </div>
        )}
      </Modal>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onGroupCreated={handleGroupCreated}
      />
    </div>
  );
}

export default ChatList;
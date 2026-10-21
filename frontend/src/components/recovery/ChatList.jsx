import { useState, useEffect } from 'react';
import { recoveryAPI, chatAPI } from '../../services/api';
import Avatar from '../common/Avatar';
import Modal from '../common/Modal';
import CreateGroupModal from './CreateGroupModal';
import { useSocket } from '../../context/SocketContext';

// ── WhatsApp-style last-seen formatter ──────────────────────────────────
const formatLastSeen = (iso) => {
  if (!iso) return null;
  const then = new Date(iso);
  if (isNaN(then.getTime())) return null;

  const now = new Date();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 0) return 'last seen just now';        // guard: future timestamps
  if (diffSec < 60) return 'last seen just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `last seen ${diffMin} min ago`;

  const sameDay = now.toDateString() === then.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYesterday = yest.toDateString() === then.toDateString();
  const timeStr = then.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (sameDay) return `last seen today at ${timeStr}`;
  if (isYesterday) return `last seen yesterday at ${timeStr}`;

  const diffDays = Math.floor(diffSec / (60 * 60 * 24));
  if (diffDays < 7) {
    const dayName = then.toLocaleDateString([], { weekday: 'long' });
    return `last seen ${dayName} at ${timeStr}`;
  }
  return `last seen ${then.toLocaleDateString()} at ${timeStr}`;
};

function ChatList({ isOpen, onClose, onSelectUser, onlineUsers = new Set(), refreshKey }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [groupUnreads, setGroupUnreads] = useState({});
  const [previewUser, setPreviewUser] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Real-time states from SocketContext
  const { lastSeen, typingUsers } = useSocket();

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchUnreadCounts();
      fetchGroups();
      fetchGroupUnreads();
    }
  }, [isOpen, refreshKey]);

  const fetchUsers = async () => {
    try {
      const res = await recoveryAPI.getUsers();
      const allowedRoles = ['director', 'secretary', 'client_relations_officer',
        'accountant', 'valuer', 'head_of_it', 'deputy_director', 'hr_manager'];
      const filtered = res.data.filter(
        u => allowedRoles.includes(u.role) && u.role !== 'admin' && u.role !== 'investor'
      );
      setUsers(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try { setGroups((await chatAPI.getGroups()).data); }
    catch (err) { console.error(err); }
  };

  const fetchUnreadCounts = async () => {
    try { setUnreadCounts((await recoveryAPI.getUnreadCountByUser()).data); }
    catch (err) { console.error(err); }
  };

  const fetchGroupUnreads = async () => {
    try { setGroupUnreads((await chatAPI.getGroupUnreadCounts()).data); }
    catch (err) { console.error(err); }
  };

  const handleAvatarClick = (user, e) => {
    e.stopPropagation();
    setPreviewUser(user);
    setShowPreview(true);
  };

  const handleGroupCreated = (newGroup) => setGroups(prev => [newGroup, ...prev]);

  // ── Per-user status line ────────────────────────────────────────────
  const renderUserSubline = (user) => {
    const isOnline = onlineUsers.has(user.id);
    const typingBucket = typingUsers[`user_${user.id}`];   // typing in chat WITH this user
    const isTyping = typingBucket && Object.keys(typingBucket).length > 0;

    if (isTyping) {
      const typers = Object.values(typingBucket).map(t => t.username);
      const label = typers.length === 1 ? `${typers[0]} is typing…` : `${typers.slice(0, 2).join(', ')} are typing…`;
      return (
        <span className="typing-status">
          <span className="typing-dots"><span /><span /><span /></span>
          {label}
        </span>
      );
    }

    if (!isOnline) {
      const ts = lastSeen[user.id] || user.last_seen;
      const formatted = formatLastSeen(ts);
      if (formatted) return <span className="last-seen">{formatted}</span>;
    }

    return <span className="chat-role">{user.role}</span>;
  };

  // ── Group subline ──────────────────────────────────────────────────
  const renderGroupSubline = (group) => {
    const bucket = typingUsers[`group_${group.id}`];
    if (bucket && Object.keys(bucket).length > 0) {
      const names = Object.values(bucket).map(t => t.username);
      const label = names.length === 1
        ? `${names[0]} is typing…`
        : `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''} are typing…`;
      return (
        <span className="typing-status">
          <span className="typing-dots"><span /><span /><span /></span>
          {label}
        </span>
      );
    }
    return <span className="chat-role">{group.member_count} members</span>;
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
            {users.map(user => {
              const isOnline = onlineUsers.has(user.id);
              return (
                <div
                  key={user.id}
                  className={`chat-list-item ${unreadCounts[user.id] > 0 ? 'unread' : ''}`}
                  onClick={() => onSelectUser({ type: 'user', data: user })}
                >
                  <div className="chat-avatar" onClick={(e) => handleAvatarClick(user, e)}>
                    <Avatar user={user} size={40} />
                  </div>
                  <div className="chat-info">
                    <div className="chat-name-row">
                      <span className="chat-name-text">{user.username}</span>
                      {isOnline && (
                        <span className="online-indicator" aria-label="Online">
                          <span className="online-dot" />
                          <span className="online-text">online</span>
                        </span>
                      )}
                    </div>
                    <div className="chat-subline">{renderUserSubline(user)}</div>
                  </div>
                  {unreadCounts[user.id] > 0 && (
                    <span className="badge bg-danger rounded-pill">{unreadCounts[user.id]}</span>
                  )}
                </div>
              );
            })}

            {groups.map(group => (
              <div
                key={`group-${group.id}`}
                className={`chat-list-item ${groupUnreads[group.id] > 0 ? 'unread' : ''}`}
                onClick={() => onSelectUser({ type: 'group', data: group })}
              >
                <div className="chat-avatar">
                  {group.profile_picture ? (
                    <img src={group.profile_picture} alt={group.name}
                      style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <i className="fas fa-users" style={{ fontSize: 24, color: '#6c757d' }} />
                  )}
                </div>
                <div className="chat-info">
                  <div className="chat-name-row">
                    <span className="chat-name-text">{group.name}</span>
                  </div>
                  <div className="chat-subline">{renderGroupSubline(group)}</div>
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

      <Modal isOpen={showPreview} onClose={() => setShowPreview(false)} title="Profile Picture" size="md">
        {previewUser && (
          <div className="text-center">
            {previewUser.profile_picture ? (
              <img src={previewUser.profile_picture} alt={previewUser.username}
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: '8px', objectFit: 'contain' }} />
            ) : (
              <div style={{
                width: '200px', height: '200px', borderRadius: '50%', backgroundColor: '#e9ecef',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto', fontSize: '80px', fontWeight: 'bold', color: '#6c757d'
              }}>
                {previewUser.username?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <p className="mt-2"><strong>{previewUser.username}</strong></p>
          </div>
        )}
      </Modal>

      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onGroupCreated={handleGroupCreated}
      />
    </div>
  );
}

export default ChatList;
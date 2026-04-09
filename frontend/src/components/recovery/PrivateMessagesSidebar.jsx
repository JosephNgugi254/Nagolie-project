import { useState, useEffect } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';

function PrivateMessagesSidebar({ onClose }) {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchUsers();
    fetchUnreadCount();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await recoveryAPI.getUsers();
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const res = await recoveryAPI.getUnreadCount();
      setUnreadCount(res.data.count);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (recipientId) => {
    setLoadingMessages(true);
    try {
      const res = await recoveryAPI.getConversation(recipientId); // need to implement
      setMessages(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedUser || !newMessage.trim()) return;
    try {
      await recoveryAPI.sendMessage(selectedUser.id, newMessage);
      setNewMessage('');
      fetchMessages(selectedUser.id);
      fetchUnreadCount();
    } catch (err) {
      showToast.error('Failed to send');
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    fetchMessages(user.id);
  };

  const markAsRead = async (msgId) => {
    await recoveryAPI.markMessageRead(msgId);
    fetchUnreadCount();
    // Update local messages read status
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, read: true } : m));
  };

  return (
    <div className="offcanvas offcanvas-end show" style={{ width: '400px', zIndex: 1050 }}>
      <div className="offcanvas-header">
        <h5 className="offcanvas-title">Private Messages</h5>
        <button type="button" className="btn-close" onClick={onClose}></button>
      </div>
      <div className="offcanvas-body">
        <div className="row">
          <div className="col-4 border-end">
            <h6>Users</h6>
            {loadingUsers ? (
              <div className="text-center py-3">Loading...</div>
            ) : (
              <ul className="list-group">
                {users.map(user => (
                  <li
                    key={user.id}
                    className={`list-group-item list-group-item-action ${selectedUser?.id === user.id ? 'active' : ''}`}
                    onClick={() => handleSelectUser(user)}
                  >
                    {user.username} ({user.role})
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="col-8">
            {selectedUser ? (
              <>
                <h6>Chat with {selectedUser.username}</h6>
                <div className="chat-messages" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
                  {loadingMessages ? (
                    <div className="text-center py-3">Loading...</div>
                  ) : messages.length === 0 ? (
                    <p className="text-muted">No messages yet.</p>
                  ) : (
                    messages.map(msg => (
                      <div key={msg.id} className={`mb-2 ${msg.sender === selectedUser.username ? 'text-start' : 'text-end'}`}>
                        <div className={`p-2 rounded ${msg.sender === selectedUser.username ? 'bg-light' : 'bg-primary text-white'}`}>
                          <strong>{msg.sender}</strong>: {msg.content}
                          <small className="d-block text-muted">{new Date(msg.created_at).toLocaleString()}</small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <button className="btn btn-primary" onClick={sendMessage}>Send</button>
                </div>
              </>
            ) : (
              <p className="text-muted">Select a user to start messaging.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrivateMessagesSidebar;
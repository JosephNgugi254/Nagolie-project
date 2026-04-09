import { useState, useEffect, useRef } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import EmojiPicker from 'emoji-picker-react';
import { io } from 'socket.io-client';

function ChatWindow({ user, onClose, onNewMessage, style }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const dragState = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const windowRef = useRef(null);

  const getCurrentUserId = () => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (userData.id) return userData.id;
    const token = localStorage.getItem('access_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub || payload.user_id;
      } catch (e) {}
    }
    return null;
  };

  const getSocketUrl = () => {
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    if (apiBase) {
      let base = apiBase.replace(/\/api\/?$/, '');
      return base;
    }
    return window.location.origin;
  };

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const token = localStorage.getItem('token');
    
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      query: { token: localStorage.getItem('token') },       // fallback
      extraHeaders: {
        Authorization: `Bearer ${localStorage.getItem('token')}`
      }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join_chat', { other_user_id: user.id });
    });

    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err);
      setSocketConnected(false);
    });

    socket.on('new_message', (data) => {
      const newMsg = data.message;
      const currentId = getCurrentUserId();
      if ((newMsg.sender_id === user.id && newMsg.recipient_id === currentId) ||
          (newMsg.sender_id === currentId && newMsg.recipient_id === user.id)) {
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();
        // Immediately mark as read if it's from the other user and chat is open
        if (newMsg.sender_id === user.id && newMsg.status !== 'read') {
          markMessageAsRead(newMsg.id);
        }
      }
    });

    socket.on('message_status_update', (data) => {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === data.message_id ? { ...msg, status: data.status } : msg
        )
      );
    });

    socket.on('message_sent', (data) => {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === data.message_id ? { ...msg, status: data.status } : msg
        )
      );
      setSending(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [user.id]);

  useEffect(() => {
    if (!windowRef.current) return;
    const handleResize = () => {
      if (windowRef.current) {
        windowRef.current.style.height = `${window.visualViewport?.height || window.innerHeight}px`;
      }
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  const markMessageAsRead = async (messageId) => {
    try {
      if (socketRef.current && socketConnected) {
        socketRef.current.emit('mark_read', { message_ids: [messageId] });
      }
      await recoveryAPI.markMessageRead(messageId);
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  // Mark all received messages as read when they become visible (IntersectionObserver)
  useEffect(() => {
    if (!messagesEndRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const msgElement = entry.target.closest('.chat-message');
            const msgId = parseInt(msgElement?.dataset.msgId);
            const msg = messages.find(m => m.id === msgId);
            if (msg && msg.sender_id === user.id && msg.status !== 'read') {
              markMessageAsRead(msgId);
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    // Observe all received message bubbles
    const messageElements = document.querySelectorAll('.chat-message.received');
    messageElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [messages, user.id]);

  // After fetching messages, mark any already visible unread messages as read
  useEffect(() => {
    if (!loading && messages.length > 0) {
      // Give time for DOM to render
      setTimeout(() => {
        const visibleReceived = document.querySelectorAll('.chat-message.received');
        visibleReceived.forEach(el => {
          const msgId = parseInt(el.dataset.msgId);
          const msg = messages.find(m => m.id === msgId);
          if (msg && msg.sender_id === user.id && msg.status !== 'read') {
            markMessageAsRead(msgId);
          }
        });
      }, 100);
    }
  }, [loading, messages, user.id]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const res = await recoveryAPI.getConversation(user.id);
      setMessages(res.data);
      const unreadReceived = res.data.filter(m => !m.read && m.sender_id === user.id);
      if (unreadReceived.length) {
        const ids = unreadReceived.map(m => m.id);
        if (socketRef.current && socketConnected) {
          socketRef.current.emit('mark_read', { message_ids: ids });
        }
      }
      if (unreadReceived.length) onNewMessage();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() && attachments.length === 0) return;
    setSending(true);
    const tempId = Date.now();
    const currentId = getCurrentUserId();
    const optimisticMsg = {
      id: tempId,
      sender_id: currentId,
      recipient_id: user.id,
      content: newMessage,
      status: 'sending',
      created_at: new Date().toISOString(),
      attachment_url: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      let attachmentUrl = null, attachmentType = null, attachmentName = null;
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach(file => formData.append('files', file));
        const uploadRes = await recoveryAPI.uploadMessageAttachment(formData);
        const firstUpload = uploadRes.data.uploads[0];
        attachmentUrl = firstUpload.url;
        attachmentType = firstUpload.mime_type;
        attachmentName = firstUpload.filename;
      }

      if (socketRef.current && socketConnected) {
        socketRef.current.emit('send_message', {
          recipient_id: user.id,
          content: newMessage,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          attachment_name: attachmentName,
        });
      } else {
        await recoveryAPI.sendMessage(user.id, newMessage, attachmentUrl, attachmentType, attachmentName);
        setSending(false);
        fetchMessages();
      }
      setNewMessage('');
      setAttachments([]);
    } catch (err) {
      showToast.error('Failed to send message');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    }
  };

  const downloadFile = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
      showToast.error('Failed to download file');
    }
  };

  const renderMessageStatus = (msg) => {
    if (msg.sender_id !== getCurrentUserId()) return null;
    switch (msg.status) {
      case 'sent':
        return <i className="fas fa-check" style={{ fontSize: '0.7rem', opacity: 0.6 }}></i>;
      case 'delivered':
        return <><i className="fas fa-check"></i><i className="fas fa-check" style={{ marginLeft: '-0.2rem' }}></i></>;
      case 'read':
        return <><i className="fas fa-check" style={{ color: '#34b7f1' }}></i><i className="fas fa-check" style={{ color: '#34b7f1', marginLeft: '-0.2rem' }}></i></>;
      default:
        return null;
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const groupMessagesByDate = () => {
    const groups = {};
    messages.forEach(msg => {
      const date = new Date(msg.created_at);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      let dateKey;
      if (date.toDateString() === today.toDateString()) dateKey = 'Today';
      else if (date.toDateString() === yesterday.toDateString()) dateKey = 'Yesterday';
      else dateKey = date.toLocaleDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const groups = groupMessagesByDate();

  const handleMouseDown = (e) => {
    if (e.target.closest('.chat-window-header-actions')) return;
    dragState.current.dragging = true;
    dragState.current.startX = e.clientX;
    dragState.current.startY = e.clientY;
    const rect = windowRef.current.getBoundingClientRect();
    dragState.current.origX = rect.left;
    dragState.current.origY = rect.top;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    windowRef.current.style.left = `${dragState.current.origX + dx}px`;
    windowRef.current.style.top = `${dragState.current.origY + dy}px`;
    windowRef.current.style.right = 'auto';
    windowRef.current.style.bottom = 'auto';
  };

  const handleMouseUp = () => {
    dragState.current.dragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div ref={windowRef} className="chat-window" style={style}>
      <div className="chat-window-header" onMouseDown={handleMouseDown} style={{ cursor: 'grab', userSelect: 'none' }}>
        <span><i className="fas fa-grip-lines me-2" style={{ opacity: 0.6 }}></i>{user.username}</span>
        <div className="chat-window-header-actions">
          <button className="btn-close btn-close-white" onClick={onClose}></button>
        </div>
      </div>
      <div className="chat-window-messages">
        {loading ? (
          <div className="text-center py-3">Loading...</div>
        ) : messages.length === 0 ? (
          <p className="text-muted text-center">No messages yet.</p>
        ) : (
          Object.entries(groups).map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="chat-date-separator">{dateKey}</div>
              {msgs.map(msg => (
                <div
                  key={msg.id}
                  className={`chat-message ${msg.sender_id === user.id ? 'received' : 'sent'}`}
                  data-msg-id={msg.id}
                >
                  <div
                    className="message-bubble"
                    style={msg.sender_id !== getCurrentUserId() && msg.status === 'read' ? { backgroundColor: '#fff3cd' } : {}}
                  >
                    <div className="message-content">
                      {msg.content}
                      {msg.attachment_url && (
                        <div className="message-attachment">
                          {msg.attachment_type?.startsWith('image/') ? (
                            <div className="position-relative">
                              <img src={msg.attachment_url} alt="attachment" className="img-fluid" />
                              <button className="btn btn-sm btn-light download-image-btn" onClick={() => downloadFile(msg.attachment_url, msg.attachment_name || 'image')}>
                                <i className="fas fa-download"></i>
                              </button>
                            </div>
                          ) : (
                            <button className="btn btn-sm btn-outline-secondary" onClick={() => downloadFile(msg.attachment_url, msg.attachment_name || 'file')}>
                              <i className="fas fa-download me-1"></i> {msg.attachment_name || 'Download file'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="message-time">
                      {formatTime(msg.created_at)}
                      {msg.sender_id === getCurrentUserId() && (
                        <span className="message-status ms-1">{renderMessageStatus(msg)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-window-input" style={{ position: 'relative' }}>
        <button className="btn btn-link p-1" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><i className="far fa-smile"></i></button>
        <input type="text" className="form-control" placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} />
        <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={(e) => setAttachments(Array.from(e.target.files))} />
        <button className="btn btn-link p-1" onClick={() => fileInputRef.current.click()}><i className="fas fa-paperclip"></i></button>
        <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={sending}>
          {sending ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-paper-plane"></i>}
        </button>
        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 9999 }}>
            <EmojiPicker onEmojiClick={(emoji) => setNewMessage(prev => prev + emoji.emoji)} />
          </div>
        )}
      </div>
      {attachments.length > 0 && (
        <div className="attachment-preview">
          {attachments.map((file, i) => (
            <div key={i} className="attachment-item">
              <span>{file.name}</span>
              <button className="btn btn-sm" onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
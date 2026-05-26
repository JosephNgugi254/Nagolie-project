import { useState, useEffect, useRef } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import EmojiPicker from 'emoji-picker-react';

function ChatWindow({ user, onClose, onNewMessage, style, globalSocket, onlineUsers }) {
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
    const token = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub || payload.user_id;
      } catch (e) {}
    }
    return null;
  };

  // ─── Viewport resize (mobile keyboard) ────────────────────────────────────
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

  // ─── Use global socket for real‑time events ────────────────────────────────
  useEffect(() => {
    const socket = globalSocket;
    if (!socket) return;
  
    // Store the global socket in a ref for easy access in sendMessage
    socketRef.current = socket;
    setSocketConnected(socket.connected);
  
    // Define event handlers
    const handleConnect = () => {
      console.log('[ChatWindow] Socket connected');
      setSocketConnected(true);
      // Notify server which chat room we are in
      socket.emit('join_chat', { other_user_id: user.id });
    };
  
    const handleDisconnect = () => {
      console.log('[ChatWindow] Socket disconnected');
      setSocketConnected(false);
    };
  
    const handleNewMessage = (data) => {
      const newMsg = data.message;
      const currentId = getCurrentUserId();
      if (
        (newMsg.sender_id === user.id && newMsg.recipient_id === currentId) ||
        (newMsg.sender_id === currentId && newMsg.recipient_id === user.id)
      ) {
        setMessages(prev => [...prev, newMsg]);
        scrollToBottom();
        if (newMsg.sender_id === user.id && newMsg.status !== 'read') {
          markMessageAsRead(newMsg.id);
        }
      }
    };
  
    const handleMessageStatusUpdate = (data) => {
      setMessages(prev =>
        prev.map(msg => msg.id === data.message_id ? { ...msg, status: data.status } : msg)
      );
    };
  
    const handleMessageSent = (data) => {
      setMessages(prev =>
        prev.map(msg => msg.id === data.message_id ? { ...msg, status: data.status } : msg)
      );
      setSending(false);
    };
  
    // Register listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);
    socket.on('message_status_update', handleMessageStatusUpdate);
    socket.on('message_sent', handleMessageSent);
  
    // If the socket is already connected, join the chat room immediately
    if (socket.connected) {
      socket.emit('join_chat', { other_user_id: user.id });
    }
  
    // Cleanup: remove listeners when component unmounts or socket changes
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new_message', handleNewMessage);
      socket.off('message_status_update', handleMessageStatusUpdate);
      socket.off('message_sent', handleMessageSent);
      // Optionally leave the room
      if (socket.connected) {
        socket.emit('leave_chat', { other_user_id: user.id });
      }
    };
  }, [globalSocket, user.id]);

  // ─── Mark read ─────────────────────────────────────────────────────────────
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

  // IntersectionObserver — mark visible received messages as read
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
    document.querySelectorAll('.chat-message.received').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [messages, user.id]);

  // After fetch — mark already-visible unread as read
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => {
        document.querySelectorAll('.chat-message.received').forEach(el => {
          const msgId = parseInt(el.dataset.msgId);
          const msg = messages.find(m => m.id === msgId);
          if (msg && msg.sender_id === user.id && msg.status !== 'read') {
            markMessageAsRead(msgId);
          }
        });
      }, 100);
    }
  }, [loading, messages, user.id]);

  // ─── Polling fallback ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  useEffect(() => { scrollToBottom(); }, [messages]);

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
        onNewMessage();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMessage.trim() && attachments.length === 0) return;
    setSending(true);
    console.log('sendMessage called, attachments:', attachments.length);

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
        console.log('Uploading attachments...');
        const formData = new FormData();
        attachments.forEach(file => formData.append('files', file));

        // Set a 60-second timeout for the upload
        const uploadPromise = recoveryAPI.uploadMessageAttachment(formData);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Upload timeout after 60s')), 60000)
        );
        const uploadRes = await Promise.race([uploadPromise, timeoutPromise]);
        console.log('✅ Upload response:', uploadRes.data);
        const firstUpload = uploadRes.data.uploads[0];
        attachmentUrl = firstUpload.url;
        attachmentType = firstUpload.mime_type;
        attachmentName = firstUpload.filename;
      }

      console.log('Sending message, socket connected:', socketConnected);
      if (socketRef.current && socketConnected) {
        socketRef.current.emit('send_message', {
          recipient_id: user.id,
          content: newMessage,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          attachment_name: attachmentName,
        });
        console.log('✅ Message emitted via socket');
      } else {
        console.log('📡 Using REST fallback');
        await recoveryAPI.sendMessage(user.id, newMessage, attachmentUrl, attachmentType, attachmentName);
        console.log('✅ Message sent via REST');
        setSending(false);
        fetchMessages();
      }

      setNewMessage('');
      setAttachments([]);
    } catch (err) {
      console.error(' Send message error:', err);
      showToast.error(`Failed to send: ${err.message}`);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    }
  };

  const downloadFile = async (url, originalFilename, mimeType) => {
    try {
      // Resolve relative URLs to full backend URL
      let fullUrl = url;
      if (!url.startsWith('http')) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        // Remove trailing /api if url already starts with /api
        const baseWithoutApi = API_BASE.replace(/\/api\/?$/, '');
        fullUrl = `${baseWithoutApi}${url}`;
      }

      console.log('Downloading from:', fullUrl);

      const isCloudinary = fullUrl.includes('cloudinary.com');
      const headers = isCloudinary ? {} : { 'Authorization': `Bearer ${localStorage.getItem('token')}` };

      const response = await fetch(fullUrl, { headers });
      console.log('Download response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', originalFilename || `attachment.${mimeType?.split('/')[1] || 'bin'}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    } catch (err) {
      console.error('Download error details:', err);   // ← now you'll see the real error
      showToast.error(`Download failed: ${err.message}`);
    }
  };

  // ─── Message status ticks ──────────────────────────────────────────────────
  const renderMessageStatus = (msg) => {
    if (msg.sender_id !== getCurrentUserId()) return null;
    switch (msg.status) {
      case 'sending':
        return <i className="fas fa-clock" style={{ fontSize: '0.7rem', opacity: 0.4 }}></i>;
      case 'sent':
        return <i className="fas fa-check" style={{ fontSize: '0.7rem', opacity: 0.6 }}></i>;
      case 'delivered':
        return (
          <>
            <i className="fas fa-check" style={{ fontSize: '0.7rem' }}></i>
            <i className="fas fa-check" style={{ fontSize: '0.7rem', marginLeft: '-0.2rem' }}></i>
          </>
        );
      case 'read':
        return (
          <>
            <i className="fas fa-check" style={{ fontSize: '0.7rem', color: '#34b7f1' }}></i>
            <i className="fas fa-check" style={{ fontSize: '0.7rem', color: '#34b7f1', marginLeft: '-0.2rem' }}></i>
          </>
        );
      default:
        return null;
    }
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  // ─── Drag handling ─────────────────────────────────────────────────────────
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={windowRef} className="chat-window" style={style}>
      <div
        className="chat-window-header"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'grab', userSelect: 'none' }}
      >
        <span>
          <i className="fas fa-grip-lines me-2" style={{ opacity: 0.6 }}></i>
          {user.username}
          <span
            style={{
              marginLeft: 8,
              fontSize: '0.75rem',
              fontWeight: 'normal',
              color: onlineUsers.has(user.id) ? '#4caf50' : '#9e9e9e',
            }}
          >
            ({onlineUsers.has(user.id) ? 'online' : 'offline'})
          </span>
        </span>
        <div className="chat-window-header-actions">
          <button className="btn-close btn-close-white" onClick={onClose}></button>
        </div>
      </div>

      <div className="chat-window-messages">
        {loading ? (
          <div className="text-center py-3">
            <span className="spinner-border spinner-border-sm me-2"></span>Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-muted text-center py-4">No messages yet.</p>
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
                    style={
                      msg.sender_id !== getCurrentUserId() && msg.status === 'read'
                        ? { backgroundColor: '#fff3cd' }
                        : {}
                    }
                  >
                    <div className="message-content">
                      {msg.content}

                      {msg.attachment_url && (
                        <div className="message-attachment mt-1">
                          {msg.attachment_type?.startsWith('image/') ? (
                            <div className="position-relative">
                              <img
                                src={msg.attachment_url}
                                alt="attachment"
                                className="img-fluid rounded"
                                style={{ maxHeight: 200, cursor: 'pointer' }}
                              />
                              <button
                                className="btn btn-sm btn-light download-image-btn"
                                style={{
                                  position: 'absolute',
                                  bottom: 4,
                                  right: 4,
                                  opacity: 0.85,
                                }}
                                onClick={() =>
                                  downloadFile(
                                    msg.attachment_url,
                                    msg.attachment_name || 'image',
                                    msg.attachment_type
                                  )
                                }
                                title="Download image"
                              >
                                <i className="fas fa-download"></i>
                              </button>
                            </div>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 mt-1"
                              onClick={() =>
                                downloadFile(
                                  msg.attachment_url,
                                  msg.attachment_name || 'file',
                                  msg.attachment_type
                                )
                              }
                            >
                              <i className="fas fa-file-download"></i>
                              <span className="text-truncate" style={{ maxWidth: 160 }}>
                                {msg.attachment_name || 'Download file'}
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="message-time">
                      {formatTime(msg.created_at)}
                      {msg.sender_id === getCurrentUserId() && (
                        <span className="message-status ms-1">
                          {renderMessageStatus(msg)}
                        </span>
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
        <button
          className="btn btn-link p-1"
          onClick={() => setShowEmojiPicker(v => !v)}
        >
          <i className="far fa-smile"></i>
        </button>

        <input
          type="text"
          className="form-control"
          placeholder="Type a message…"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && sendMessage()}
        />

        <input
          type="file"
          multiple
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={e => setAttachments(Array.from(e.target.files))}
        />

        <button
          className="btn btn-link p-1"
          onClick={() => fileInputRef.current.click()}
          title="Attach file"
        >
          <i className="fas fa-paperclip"></i>
        </button>

        <button
          className="btn btn-primary btn-sm"
          onClick={sendMessage}
          disabled={sending}
        >
          {sending
            ? <span className="spinner-border spinner-border-sm"></span>
            : <i className="fas fa-paper-plane"></i>
          }
        </button>

        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 9999 }}>
            <EmojiPicker
              onEmojiClick={emoji => setNewMessage(prev => prev + emoji.emoji)}
            />
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="attachment-preview">
          {attachments.map((file, i) => (
            <div key={i} className="attachment-item">
              <i className={`fas fa-${file.type.startsWith('image/') ? 'image' : 'file'} me-1`}></i>
              <span className="text-truncate" style={{ maxWidth: 120 }}>{file.name}</span>
              <button
                className="btn btn-sm ms-1"
                onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { recoveryAPI, chatAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import EmojiPicker from 'emoji-picker-react';
import { useCall } from '../../context/CallContext';
import GroupCallModal from '../call/GroupCallModal';
import Avatar from '../common/Avatar';
import Modal from '../common/Modal';
import ConfirmationDialog from '../common/ConfirmationDialog';
import AddParticipantModal from '../call/AddParticipantModal';

// ------------------------------------------------------------
// WaveformAudioPlayer
// ------------------------------------------------------------
const WaveformAudioPlayer = memo(({ src, isRead = false, isOwnMessage = false, onMarkAsRead }) => {
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [permanentBlue, setPermanentBlue] = useState(isRead);
  const [isReplaying, setIsReplaying] = useState(false);

  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const waveDataRef = useRef(null);
  const isReadRef = useRef(isRead);
  const objUrlRef = useRef(null);

  const placeholderWave = useMemo(() => {
    const bars = 60;
    return Array.from({ length: bars }, (_, i) => {
      const envelope = Math.sin((i / bars) * Math.PI) * 0.7 + 0.3;
      return Math.min(1, envelope * (0.4 + Math.random() * 0.6));
    });
  }, []);

  const draw = useCallback((percent) => {
    const canvas = canvasRef.current;
    if (!canvas || !waveDataRef.current) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const barWidth = W / waveDataRef.current.length;
    const finalPercent = (permanentBlue && !isReplaying) ? 1 : Math.min(1, Math.max(0, percent));
    const played = Math.floor(waveDataRef.current.length * finalPercent);
    for (let i = 0; i < waveDataRef.current.length; i++) {
      const barHeight = Math.max(3, waveDataRef.current[i] * H * 0.85);
      ctx.fillStyle = i < played ? '#34b7f1' : '#c8c8c8';
      ctx.fillRect(i * barWidth, (H - barHeight) / 2, Math.max(1, barWidth - 1), barHeight);
    }
  }, [permanentBlue, isReplaying]);

  useEffect(() => {
    waveDataRef.current = placeholderWave;
    draw(0);
  }, [placeholderWave, draw]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    draw(0);

    const onMeta = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onDurationChange = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onTimeUpdate = () => {
      if (!audio.duration) return;
      setCurrentTime(audio.currentTime);
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(d => d > 0 ? d : audio.duration);
      }
      const pct = (permanentBlue && !isReplaying) ? 1 : audio.currentTime / audio.duration;
      draw(pct);
    };
    const onEnded = () => {
      setIsPlaying(false);
      if (isReplaying) {
        setIsReplaying(false);
        draw(1);
      } else if (!permanentBlue && !isOwnMessage && !isReadRef.current) {
        setPermanentBlue(true);
        if (onMarkAsRead) onMarkAsRead();
        draw(1);
      } else {
        draw(permanentBlue ? 1 : 0);
      }
    };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    let url = src;
    if (!src.startsWith('http')) {
      const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
      url = `${base}${src}`;
    }

    let cancelled = false;
    fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (cancelled) return;
        if (objUrlRef.current) URL.revokeObjectURL(objUrlRef.current);
        const objUrl = URL.createObjectURL(blob);
        objUrlRef.current = objUrl;
        audio.src = objUrl;
        audio.preload = 'auto';
        audio.load();
        setLoadError(null);
      })
      .catch(err => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.pause();
      audio.src = '';
      if (objUrlRef.current) { URL.revokeObjectURL(objUrlRef.current); objUrlRef.current = null; }
    };
  }, [src]);

  useEffect(() => {
    isReadRef.current = isRead;
    if (isRead && !permanentBlue) {
      setPermanentBlue(true);
      setIsReplaying(false);
      draw(1);
    } else if (!isRead && permanentBlue && !isOwnMessage) {
      setPermanentBlue(false);
      draw(0);
    }
  }, [isRead, permanentBlue, isOwnMessage, draw]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (permanentBlue && !isPlaying && !isReplaying) setIsReplaying(true);
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(err => console.error('Play failed:', err));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = pct * audio.duration;
    if (isFinite(t)) {
      audio.currentTime = t;
      setCurrentTime(t);
      draw((permanentBlue && !isReplaying) ? 1 : pct);
    }
  };

  const fmt = (t) => {
    if (!isFinite(t) || t < 0) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loadError) return (
    <div className="text-danger small">
      Failed to load.{' '}
      <button className="btn btn-link btn-sm p-0" onClick={() => window.location.reload()}>Retry</button>
    </div>
  );

  return (
    <div className="waveform-audio-player" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <audio ref={audioRef} preload="auto" />
      <button className="play-pause-btn-wave" onClick={togglePlay} style={{ flexShrink: 0 }}>
        <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`} />
      </button>
      <canvas
        ref={canvasRef}
        width={160}
        height={32}
        className="waveform-canvas"
        onClick={handleSeek}
        style={{ cursor: 'pointer', flexShrink: 0 }}
      />
      <span className="audio-time" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
        {fmt(currentTime)} / {duration > 0 ? fmt(duration) : '0:00'}
      </span>
    </div>
  );
});

// ------------------------------------------------------------
// LiveWaveform
// ------------------------------------------------------------
const LiveWaveform = ({ analyserNode }) => {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!analyserNode) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const buf = new Uint8Array(analyserNode.frequencyBinCount);
    const { width: W, height: H } = canvas;
    const tick = (now) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastTimeRef.current < 50) return;
      lastTimeRef.current = now;
      analyserNode.getByteTimeDomainData(buf);
      ctx.clearRect(0, 0, W, H);
      ctx.beginPath();
      ctx.strokeStyle = '#dc3545';
      ctx.lineWidth = 1.5;
      const sw = W / buf.length;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const y = ((buf[i] / 128.0) * H) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sw;
      }
      ctx.stroke();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyserNode]);

  return <canvas ref={canvasRef} width={120} height={28} className="live-waveform" />;
};

// ------------------------------------------------------------
// ForwardModal
// ------------------------------------------------------------
function ForwardModal({ isOpen, onClose, message, onForward }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (isOpen) load(); }, [isOpen]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await recoveryAPI.getUsers();
      const ok = ['director','secretary','accountant','valuer','head_of_it','deputy_director', 'hr_manager', 'client_relations_officer'];
      setUsers(res.data.filter(u => ok.includes(u.role) && u.role !== 'admin' && u.role !== 'investor'));
    } catch { showToast.error('Failed to load users'); }
    finally { setLoading(false); }
  };

  const toggle = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  if (!isOpen) return null;
  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Forward message</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <input className="form-control mb-3" placeholder="Search users…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {loading ? <div className="text-center py-3">Loading…</div>
                : !filtered.length ? <p className="text-muted">No users found</p>
                : filtered.map(u => (
                  <div key={u.id} className="form-check py-1">
                    <input className="form-check-input" type="checkbox" id={`fu-${u.id}`}
                      checked={selected.includes(u.id)} onChange={() => toggle(u.id)} />
                    <label className="form-check-label ms-2" htmlFor={`fu-${u.id}`}>
                      <strong>{u.username}</strong> ({u.role})
                    </label>
                  </div>
                ))}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!selected.length}
              onClick={() => { if (!selected.length) return; onForward(selected); onClose(); }}>
              Forward ({selected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Helper: user colors
// ------------------------------------------------------------
const getUserColor = (userId) => {
  const colors = ['#1e40af', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  return colors[userId % colors.length];
};

const getUserBgColor = (userId) => {
  const bgColors = ['#e0e7ff', '#d1fae5', '#fef3c7', '#fee2e2', '#ede9fe', '#fce7f3', '#ccfbf1', '#ffedd5'];
  return bgColors[userId % bgColors.length];
};

// ------------------------------------------------------------
// MessageBubble
// ------------------------------------------------------------
const MessageBubble = memo(({
  msg, isOwn, user, showSender, onEdit, onCopy, onForward, onDelete, onDownloadFile,
  editingMessageId, editContent, setEditContent, saveEdit, setEditingMessageId,
  openMenuId, setOpenMenuId, menuRef, handleTouchStart, handleTouchEnd,
  renderStatus, fmtTime, markRead, onReply, onScrollToMessage, isGroup,
}) => {
  // System message
  if (msg.is_system_message) {
    return (
      <div className="chat-message" data-msg-id={msg.id}>
        <div className="system-message">{msg.content}</div>
      </div>
    );
  }

  // Call log message
  if (msg.is_call_log) {
    return (
      <div className="chat-message" data-msg-id={msg.id}>
        <div className="call-log-message">{msg.content}</div>
      </div>
    );
  }

  const isSalaryMessage = msg.content && (
    msg.content.includes('salary advance') ||
    msg.content.includes('approved') ||
    msg.content.includes('rejected') ||
    msg.content.includes('KES') ||
    msg.content.includes('withdrawal') ||
    msg.content.includes('payment')
  );

  const bubbleClass = `message-bubble ${isOwn ? 'sent' : 'received'} ${isSalaryMessage ? 'salary-message' : ''}`;

  // Background color: for group received messages, use sender-specific light color
  const bubbleStyle = {};
  if (!isOwn && isGroup && showSender) {
    bubbleStyle.backgroundColor = getUserBgColor(msg.sender_id);
  } else if (!isOwn && msg.status === 'read') {
    bubbleStyle.backgroundColor = '#fff3cd';
  }

  const handleImageClick = () => {
    if (!isOwn && msg.status !== 'read') {
      markRead(msg.id);
    }
  };

  const handleFileDownload = (e) => {
    if (!isOwn && msg.status !== 'read') {
      markRead(msg.id);
    }
    onDownloadFile(msg.attachment_url, msg.attachment_name, msg.attachment_type);
  };

  // Render reply quote
  const renderReplyQuote = () => {
    if (!msg.reply_to) return null;
    const replied = msg.reply_to;
    const senderName = replied.sender || 'User';
    let contentPreview = replied.content;
    if (replied.attachment_type?.startsWith('image/')) {
      contentPreview = '📷 Photo';
    } else if (replied.attachment_type?.startsWith('audio/')) {
      contentPreview = '🎤 Voice message';
    } else if (replied.attachment_url && !replied.attachment_type?.startsWith('image/') && !replied.attachment_type?.startsWith('audio/')) {
      contentPreview = `📎 ${replied.attachment_name || 'File'}`;
    }
    return (
      <div
        className="reply-quote"
        onClick={(e) => {
          e.stopPropagation();
          onScrollToMessage(replied.id);
        }}
      >
        <div className="reply-quote-sender">{senderName}</div>
        <div className="reply-quote-content">{contentPreview}</div>
      </div>
    );
  };

  return (
    <div
      className={`chat-message ${isOwn ? 'sent' : 'received'}`}
      data-msg-id={msg.id}
      onTouchStart={() => handleTouchStart(msg.id)}
      onTouchEnd={handleTouchEnd}
    >
      <div className={bubbleClass} style={bubbleStyle}>
        {/* Sender name inside the bubble (above content) for groups */}
        {showSender && !isOwn && (
          <div className="sender-name" style={{ color: getUserColor(msg.sender_id), fontWeight: 'bold', marginBottom: '2px' }}>
            {msg.sender}
          </div>
        )}
        <div className="message-content">
          {editingMessageId === msg.id ? (
            <div>
              <textarea className="form-control form-control-sm" rows="2" autoFocus
                value={editContent} onChange={e => setEditContent(e.target.value)} />
              <div className="mt-1">
                <button className="btn btn-sm btn-primary me-1" onClick={() => saveEdit(msg.id)}>Save</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setEditingMessageId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {renderReplyQuote()}
              {msg.content}
              {msg.attachment_url && msg.attachment_type?.startsWith('image/') && (
                <div className="message-attachment mt-1 position-relative">
                  <img
                    src={msg.attachment_url}
                    alt="attachment"
                    className="img-fluid rounded"
                    style={{ maxHeight: 200, cursor: 'pointer' }}
                    onClick={handleImageClick}
                  />
                  <button className="btn btn-sm btn-light download-image-btn"
                    style={{ position: 'absolute', bottom: 4, right: 4, opacity: 0.85 }}
                    onClick={handleFileDownload}>
                    <i className="fas fa-download" />
                  </button>
                </div>
              )}
              {msg.attachment_url && msg.attachment_type?.startsWith('audio/') && (
                <div className="message-attachment mt-2">
                  <WaveformAudioPlayer
                    src={msg.attachment_url}
                    isRead={msg.status === 'read'}
                    isOwnMessage={isOwn}
                    onMarkAsRead={() => markRead(msg.id)}
                  />
                </div>
              )}
              {msg.attachment_url && !msg.attachment_type?.startsWith('image/') && !msg.attachment_type?.startsWith('audio/') && (
                <button
                  className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 mt-1"
                  onClick={handleFileDownload}
                >
                  <i className="fas fa-file-download" />
                  <span className="text-truncate" style={{ maxWidth: 160 }}>{msg.attachment_name || 'Download file'}</span>
                </button>
              )}
            </>
          )}
        </div>
        <div className="message-time">
          {fmtTime(msg.created_at)}
          {isOwn && <span className="message-status ms-1">{renderStatus(msg)}</span>}
          {msg.edited && <span className="ms-1 text-muted small">(edited)</span>}
        </div>
        {/* Always show menu, but Edit/Delete conditional */}
        <div className="message-actions-dropdown">
          <i className="fas fa-ellipsis-v"
             onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }} />
          {openMenuId === msg.id && (
            <div className="message-actions-menu" ref={menuRef}>
              <button onClick={() => onReply(msg)}><i className="fas fa-reply" /> Reply</button>
              {isOwn && !msg.attachment_url && (
                <button onClick={() => onEdit(msg)}><i className="fas fa-edit" /> Edit</button>
              )}
              <button onClick={() => onCopy(msg)}><i className="fas fa-copy" /> Copy</button>
              <button onClick={() => onForward(msg)}><i className="fas fa-share" /> Forward</button>
              {isOwn && (
                <button onClick={() => onDelete(msg)}><i className="fas fa-trash" /> Delete</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ------------------------------------------------------------
// Main ChatWindow
// ------------------------------------------------------------
function ChatWindow({ chat, onClose, onNewMessage, style, globalSocket, onlineUsers }) {
  const getCurrentUserId = () => {
    const ud = JSON.parse(localStorage.getItem('user') || '{}');
    if (ud.id) return ud.id;
    const tok = localStorage.getItem('access_token') || localStorage.getItem('token');
    if (tok) {
      try { const p = JSON.parse(atob(tok.split('.')[1])); return p.sub || p.user_id; } catch {}
    }
    return null;
  };
  
  const isGroup = chat.type === 'group';
  const user = isGroup ? null : chat.data;
  const group = isGroup ? chat.data : null;

  // ---------- CALL INTEGRATION ----------
  const { startCall, endCall, setIsMinimized } = useCall();
  const [showGroupModal, setShowGroupModal] = useState(false);

  const handleStartGroupCall = (participantIds) => {
    startCall(null, 'voice', true, participantIds);
    setShowGroupModal(false);
  };

  const handleStartCall = (type) => {
    if (!onlineUsers.has(user.id)) {
      showToast.error(`${user.username} is offline`);
      return;
    }
    startCall(user.id, type);
  };

  const [showAvatarPreview, setShowAvatarPreview] = useState(false);

  // ----- Group members state -----
  const [members, setMembers] = useState([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showMembersDropdown, setShowMembersDropdown] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  const isGroupAdmin = group?.created_by === getCurrentUserId();

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [analyserNode, setAnalyserNode] = useState(null);
  const [showVoiceConfirm, setShowVoiceConfirm] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [liveDuration, setLiveDuration] = useState(0);
  const [finalDuration, setFinalDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const liveDurRef = useRef(0);
  const recStreamRef = useRef(null);
  const recAudioCtxRef = useRef(null);

  // Messages state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const pendingTempIds = useRef(new Map());

  // Reply-to state
  const [replyTo, setReplyTo] = useState(null);

  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [forwardMessage, setForwardMessage] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const menuRef = useRef(null);
  const longPressTimer = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(null);

  const virtuosoRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const isUserAtBottom = useRef(true);
  const initialScrollDone = useRef(false);

  const dragState = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const windowRef = useRef(null);

  const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDur = (sec) => { const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${s < 10 ? '0' : ''}${s}`; };

  // Format call log
  const formatCallLog = (log) => {
    const emoji = log.call_type === 'video' ? '📹' : '📞';
    const typeLabel = log.call_type === 'video' ? 'Video' : 'Voice';
    let statusText = '';
    const duration = log.duration_seconds || 0;
    const durStr = duration > 0 ? ` · ${fmtDur(duration)}` : '';
    switch (log.status) {
      case 'missed': statusText = 'Missed'; break;
      case 'declined': statusText = 'Declined'; break;
      case 'cancelled': statusText = 'Cancelled'; break;
      case 'answered': statusText = ''; break;
      default: statusText = '';
    }
    let result = `${emoji} ${typeLabel} call`;
    if (statusText) result += ` ${statusText}`;
    if (durStr) result += durStr;
    return result;
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (!messages.length) return;
    const timer = setTimeout(() => {
      if (virtuosoRef.current && isUserAtBottom.current) {
        virtuosoRef.current.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' });
        setShowScrollButton(false);
        setNewMessageCount(0);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [messages]);

  // Resize handling
  useEffect(() => {
    if (!windowRef.current) return;
    const fn = () => { if (windowRef.current) windowRef.current.style.height = `${window.visualViewport?.height || window.innerHeight}px`; };
    window.visualViewport?.addEventListener('resize', fn);
    return () => window.visualViewport?.removeEventListener('resize', fn);
  }, []);

  // ---------- Socket & message fetching ----------
  useEffect(() => {
    const socket = globalSocket;
    if (!socket) return;
    socketRef.current = socket;
    setSocketConnected(socket.connected);

    const onConn = () => {
      setSocketConnected(true);
      if (isGroup) {
        socket.emit('join_group', { group_id: group.id });
      } else {
        socket.emit('join_chat', { other_user_id: user.id });
      }
    };
    const onDisconn = () => setSocketConnected(false);

    const onNewMsg = (data) => {
      const m = data.message;
      const cid = getCurrentUserId();

      setMessages(prev => {
        if (prev.some(msg => msg.id === m.id)) return prev;
        if (m.sender_id === cid) {
          const tempIdx = prev.findIndex(msg =>
            pendingTempIds.current.has(msg.id) &&
            msg.sender_id === cid &&
            (isGroup ? msg.group_id === group.id : msg.recipient_id === user.id)
          );
          if (tempIdx !== -1) {
            pendingTempIds.current.delete(prev[tempIdx].id);
            const updated = [...prev];
            updated[tempIdx] = { ...m, is_call_log: false };
            return updated;
          }
        }
        return [...prev, { ...m, is_call_log: false }];
      });

      if (!isGroup && m.sender_id === user.id && m.status !== 'read') markRead(m.id);
      if (m.sender_id !== cid && onNewMessage) {
        onNewMessage();
      }

      if (!isUserAtBottom.current) {
        setNewMessageCount(p => p + 1);
        setShowScrollButton(true);
      }
    };

    const onStatus = (d) =>
      setMessages(prev => prev.map(m => m.id === d.message_id ? { ...m, status: d.status } : m));

    const onSent = (d) => {
      if (window._sendTO) clearTimeout(window._sendTO);
      setSending(false);
      const realMsg = d.message;
      const tempId = d.temp_id;
      if (realMsg && tempId) {
        pendingTempIds.current.delete(tempId);
        setMessages(prev => {
          if (prev.some(msg => msg.id === realMsg.id)) {
            return prev.map(m => m.id === realMsg.id ? { ...m, status: realMsg.status } : m);
          }
          return prev.map(m => m.id === tempId ? { ...realMsg, is_call_log: false } : m);
        });
      }
      scrollToBottom();
    };

    socket.on('connect', onConn);
    socket.on('disconnect', onDisconn);
    socket.on('new_message', onNewMsg);
    socket.on('message_status_update', onStatus);
    socket.on('message_sent', onSent);
    socket.on('new_group_message', onNewMsg);
    socket.on('group_message_sent', onSent);

    if (socket.connected) onConn();

    fetchMessages();

    return () => {
      socket.off('connect', onConn);
      socket.off('disconnect', onDisconn);
      socket.off('new_message', onNewMsg);
      socket.off('message_status_update', onStatus);
      socket.off('message_sent', onSent);
      socket.off('new_group_message', onNewMsg);
      socket.off('group_message_sent', onSent);
      if (socket.connected) {
        if (isGroup) {
          socket.emit('leave_group', { group_id: group.id });
        } else {
          socket.emit('leave_chat', { other_user_id: user.id });
        }
      }
    };
  }, [globalSocket, user?.id, group?.id, isGroup]);

  // Mark message as read (only for user chats) – now calls onNewMessage
  const markRead = async (id) => {
    if (isGroup) return;
    try {
      if (socketRef.current && socketConnected) socketRef.current.emit('mark_read', { message_ids: [id] });
      await recoveryAPI.markMessageRead(id);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'read' } : m));
      onNewMessage(); // refresh sidebar unread badge immediately
    } catch {}
  };

  // Fetch messages
  const fetchMessages = async () => {
    try {
      let transformed = [];
      if (isGroup) {
        const res = await chatAPI.getGroupDetails(group.id);
        setMembers(res.data.members || []);
        transformed = (res.data.messages || []).map(m => ({ ...m, is_call_log: false }));
        // Mark all messages in this group as read
        try {
          await chatAPI.markGroupRead(group.id);
          onNewMessage();
        } catch (e) {
          console.error('Failed to mark group as read:', e);
        }
      } else {
        const res = await recoveryAPI.getConversation(user.id);
        const combined = res.data || [];
        transformed = combined.map(item => {
          if (item.type === 'call_log') {
            const log = item.data;
            return {
              id: `call-${log.id}`,
              sender_id: log.caller_id,
              recipient_id: log.callee_id,
              content: formatCallLog(log),
              created_at: log.started_at,
              is_call_log: true,
              status: 'read',
              _callLog: log,
            };
          } else {
            return { ...item.data, is_call_log: false };
          }
        });
        const unread = transformed.filter(m => !m.is_call_log && !m.read && m.sender_id === user.id);
        if (unread.length) {
          if (socketRef.current && socketConnected) socketRef.current.emit('mark_read', { message_ids: unread.map(m => m.id) });
          onNewMessage();
        }
      }
      setMessages(transformed);
    } catch (err) { console.error(err); }
    finally {
      setLoading(false);
      setTimeout(() => {
        if (virtuosoRef.current && !initialScrollDone.current) {
          virtuosoRef.current.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' });
          initialScrollDone.current = true;
        }
      }, 80);
    }
  };

  // Scroll to bottom
  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' });
    setShowScrollButton(false);
    setNewMessageCount(0);
  };

  // Scroll to a specific message
  const scrollToMessage = (messageId) => {
    const index = groupedMessages.findIndex(g => g.type === 'message' && g.message.id === messageId);
    if (index !== -1 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
      setTimeout(() => {
        const el = document.querySelector(`[data-msg-id="${messageId}"]`);
        if (el) {
          el.classList.add('highlight-reply');
          setTimeout(() => el.classList.remove('highlight-reply'), 2000);
        }
      }, 300);
    } else {
      showToast.info('Message not found in current view');
    }
  };

  // Send message with optional reply
  const sendMessage = async () => {
    const content = newMessage, files = attachments;
    if (!content?.trim() && !files.length) return;

    setSending(true);
    const tempId = Date.now();
    const cid = getCurrentUserId();

    pendingTempIds.current.set(tempId, true);

    const tempMsg = {
      id: tempId,
      sender_id: cid,
      recipient_id: isGroup ? null : user.id,
      group_id: isGroup ? group.id : null,
      content,
      status: 'sending',
      created_at: new Date().toISOString(),
      attachment_url: null,
      is_call_log: false,
      reply_to: replyTo ? {
        id: replyTo.id,
        sender: replyTo.sender,
        content: replyTo.content,
        attachment_type: replyTo.attachment_type,
        attachment_name: replyTo.attachment_name,
      } : null,
    };

    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');
    setAttachments([]);
    const currentReply = replyTo;
    setReplyTo(null);

    try {
      let aUrl = null, aType = null, aName = null;
      if (files.length) {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        const up = await recoveryAPI.uploadMessageAttachment(fd);
        ({ url: aUrl, mime_type: aType, filename: aName } = up.data.uploads[0]);
      }

      if (isGroup) {
        if (socketRef.current && socketConnected) {
          window._sendTO = setTimeout(() => {
            setSending(false);
            showToast.error('Sending timed out');
            pendingTempIds.current.delete(tempId);
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }, 15000);
          socketRef.current.emit('send_group_message', {
            group_id: group.id,
            content,
            attachment_url: aUrl,
            attachment_type: aType,
            attachment_name: aName,
            temp_id: tempId,
            reply_to_id: currentReply?.id || null,
          });
        } else {
          const res = await chatAPI.sendGroupMessage(group.id, {
            content,
            attachment_url: aUrl,
            attachment_type: aType,
            attachment_name: aName,
            reply_to_id: currentReply?.id || null,
          });
          pendingTempIds.current.delete(tempId);
          setMessages(prev => prev.map(m => m.id === tempId ? { ...res.data, is_call_log: false } : m));
          setSending(false);
        }
      } else {
        if (socketRef.current && socketConnected) {
          window._sendTO = setTimeout(() => {
            setSending(false);
            showToast.error('Sending timed out');
            pendingTempIds.current.delete(tempId);
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }, 15000);
          socketRef.current.emit('send_message', {
            recipient_id: user.id,
            content,
            attachment_url: aUrl,
            attachment_type: aType,
            attachment_name: aName,
            temp_id: tempId,
            reply_to_id: currentReply?.id || null,
          });
        } else {
          const res = await recoveryAPI.sendMessage(
            user.id,
            content,
            aUrl,
            aType,
            aName,
            currentReply?.id || null
          );
          pendingTempIds.current.delete(tempId);
          setMessages(prev => prev.map(m => m.id === tempId ? { ...res.data, is_call_log: false } : m));
          setSending(false);
        }
      }
    } catch (err) {
      showToast.error(`Failed to send: ${err.message}`);
      pendingTempIds.current.delete(tempId);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    }
  };

  // ----- Voice recording functions -----
  const getBestMime = () => {
    for (const t of ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4','']) {
      if (!t || MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      recStreamRef.current = stream;
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      recAudioCtxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      setAnalyserNode(an);

      const mime = getBestMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      audioChunksRef.current = [];
      liveDurRef.current = 0;

      recorder.ondataavailable = (e) => { if (e.data?.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        clearInterval(timerRef.current);
        setFinalDuration(liveDurRef.current);
        setLiveDuration(0);
        setAnalyserNode(null);
        recAudioCtxRef.current?.close();
        recStreamRef.current?.getTracks().forEach(t => t.stop());
        const chunks = audioChunksRef.current;
        if (!chunks.length) { showToast.error('No audio captured — try again'); return; }
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setShowVoiceConfirm(true);
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        liveDurRef.current += 1;
        setLiveDuration(liveDurRef.current);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      showToast.error('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.stop();
    setIsRecording(false);
  };

  const toggleRecording = () => isRecording ? stopRecording() : startRecording();

  const confirmAndSendVoice = async () => {
    if (!recordedBlob) return;
    setShowVoiceConfirm(false);

    const ext = recordedBlob.type.includes('ogg') ? 'ogg' : recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([recordedBlob], `voice_${Date.now()}.${ext}`, { type: recordedBlob.type });

    setSending(true);
    const tempId = Date.now();
    const cid = getCurrentUserId();

    pendingTempIds.current.set(tempId, true);
    setMessages(prev => [...prev, {
      id: tempId, sender_id: cid,
      recipient_id: isGroup ? null : user.id,
      group_id: isGroup ? group.id : null,
      content: '🎤 Voice message',
      status: 'sending',
      created_at: new Date().toISOString(),
      attachment_url: null,
      is_call_log: false,
    }]);
    scrollToBottom();

    try {
      const fd = new FormData();
      fd.append('files', file);
      const up = await recoveryAPI.uploadMessageAttachment(fd);
      const { url: aUrl, mime_type: aType, filename: aName } = up.data.uploads[0];

      if (isGroup) {
        if (socketRef.current && socketConnected) {
          window._sendTO = setTimeout(() => {
            setSending(false);
            showToast.error('Sending timed out');
            pendingTempIds.current.delete(tempId);
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }, 15000);
          socketRef.current.emit('send_group_message', {
            group_id: group.id,
            content: '🎤 Voice message',
            attachment_url: aUrl,
            attachment_type: aType,
            attachment_name: aName,
            temp_id: tempId,
          });
        } else {
          const res = await chatAPI.sendGroupMessage(group.id, {
            content: '🎤 Voice message',
            attachment_url: aUrl,
            attachment_type: aType,
            attachment_name: aName,
          });
          pendingTempIds.current.delete(tempId);
          setMessages(prev => prev.map(m => m.id === tempId ? { ...res.data, is_call_log: false } : m));
          setSending(false);
        }
      } else {
        if (socketRef.current && socketConnected) {
          window._sendTO = setTimeout(() => {
            setSending(false);
            showToast.error('Sending timed out');
            pendingTempIds.current.delete(tempId);
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }, 15000);
          socketRef.current.emit('send_message', {
            recipient_id: user.id,
            content: '🎤 Voice message',
            attachment_url: aUrl,
            attachment_type: aType,
            attachment_name: aName,
            temp_id: tempId,
          });
        } else {
          const res = await recoveryAPI.sendMessage(user.id, '🎤 Voice message', aUrl, aType, aName);
          pendingTempIds.current.delete(tempId);
          setMessages(prev => prev.map(m => m.id === tempId ? { ...res.data, is_call_log: false } : m));
          setSending(false);
        }
      }
    } catch {
      showToast.error('Failed to send voice note');
      pendingTempIds.current.delete(tempId);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    } finally { setRecordedBlob(null); }
  };

  const cancelVoice = () => { setShowVoiceConfirm(false); setRecordedBlob(null); };

  // Download file
  const downloadFile = async (url, name, mime) => {
    try {
      let full = url;
      if (!url.startsWith('http'))
        full = `${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')}${url}`;
      const headers = full.includes('cloudinary.com') ? {} : { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const r = await fetch(full, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: name || `file.${mime?.split('/')[1] || 'bin'}`,
      });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 100);
    } catch (e) { showToast.error(`Download failed: ${e.message}`); }
  };

  // Message actions
  const handleEdit = async (msg) => {
    if (isGroup && msg.sender_id !== getCurrentUserId()) {
      showToast.error('You can only edit your own messages');
      return;
    }
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setOpenMenuId(null);
  };

  const saveEdit = async (id) => {
    if (!editContent.trim()) return;
    try {
      let res;
      if (isGroup) {
        res = await chatAPI.editMessage(id, editContent);
      } else {
        res = await recoveryAPI.editMessage(id, editContent);
      }
      if (res.data.success) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, content: editContent, edited: true } : m));
        setEditingMessageId(null);
        setEditContent('');
        showToast.success('Message edited');
      }
    } catch { showToast.error('Failed to edit'); }
  };

  const handleDelete = (msg) => {
    if (isGroup && msg.sender_id !== getCurrentUserId()) {
      showToast.error('You can only delete your own messages');
      return;
    }
    setDeletingMessage(msg);
    setShowDeleteConfirm(true);
    setOpenMenuId(null);
  };

  const confirmDelete = async () => {
    if (!deletingMessage) return;
    try {
      if (isGroup) {
        await chatAPI.deleteMessage(deletingMessage.id);
      } else {
        await recoveryAPI.deleteMessage(deletingMessage.id);
      }
      setMessages(prev => prev.filter(m => m.id !== deletingMessage.id));
      showToast.success('Deleted');
    } catch { showToast.error('Failed to delete'); }
    finally { setShowDeleteConfirm(false); setDeletingMessage(null); }
  };

  const handleCopy = (msg) => { navigator.clipboard.writeText(msg.content); showToast.success('Copied'); setOpenMenuId(null); };

  const handleForward = (msg) => {
    setForwardMessage(msg);
    setShowForwardModal(true);
    setOpenMenuId(null);
  };

  const forwardToUsers = async (ids) => {
    if (!forwardMessage) return;
    for (const rid of ids) {
      try {
        await recoveryAPI.sendMessage(rid, `Forwarded: ${forwardMessage.content}`, forwardMessage.attachment_url, forwardMessage.attachment_type, forwardMessage.attachment_name);
      } catch {}
    }
    showToast.success(`Forwarded to ${ids.length} user(s)`);
    setForwardMessage(null);
  };

  // Reply handler
  const handleReply = (msg) => {
    const senderName = msg.sender_id === getCurrentUserId() ? 'You' : (msg.sender || (isGroup ? msg.sender : user.username));
    setReplyTo({
      id: msg.id,
      sender: senderName,
      content: msg.content,
      attachment_type: msg.attachment_type,
      attachment_name: msg.attachment_name,
    });
    setOpenMenuId(null);
    const input = document.querySelector('.chat-window-input input');
    if (input) input.focus();
  };

  // Leave group – now uses modal
  const handleLeaveGroup = () => setShowLeaveModal(true);

  const confirmLeaveGroup = async () => {
    try {
      await chatAPI.leaveGroup(group.id);
      showToast.success('You left the group');
      onClose();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to leave');
    } finally {
      setShowLeaveModal(false);
    }
  };

  // Add member to group
  const handleAddMember = async (newUserId) => {
    try {
      await chatAPI.addGroupMember(group.id, newUserId);
      showToast.success('Member added');
      fetchMessages();
    } catch (err) {
      showToast.error(err.response?.data?.error || 'Failed to add member');
    }
  };

  // Click outside menu
  useEffect(() => {
    const fn = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null); };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, []);

  const handleTouchStart = (id) => { longPressTimer.current = setTimeout(() => setOpenMenuId(id), 500); };
  const handleTouchEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  // Touch swipe to reply (mobile)
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchMsgId = useRef(null);

  const onTouchStart = (e, msgId) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchMsgId.current = msgId;
  };

  const onTouchEnd = (e) => {
    if (touchMsgId.current === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX.current;
    const dy = touch.clientY - touchStartY.current;
    if (Math.abs(dx) > 40 && Math.abs(dy) < 30 && dx > 0) {
      const msg = messages.find(m => m.id === touchMsgId.current);
      if (msg && !msg.is_call_log) {
        handleReply(msg);
      }
    }
    touchMsgId.current = null;
  };

  // Render status icons
  const renderStatus = (msg) => {
    if (msg.sender_id !== getCurrentUserId()) return null;
    const s = { fontSize: '0.7rem' };
    switch (msg.status) {
      case 'sending':   return <i className="fas fa-clock" style={{ ...s, opacity: 0.4 }} />;
      case 'sent':      return <i className="fas fa-check" style={{ ...s, opacity: 0.6 }} />;
      case 'delivered': return <><i className="fas fa-check" style={s} /><i className="fas fa-check" style={{ ...s, marginLeft: '-0.2rem' }} /></>;
      case 'read':      return <><i className="fas fa-check" style={{ ...s, color: '#34b7f1' }} /><i className="fas fa-check" style={{ ...s, color: '#34b7f1', marginLeft: '-0.2rem' }} /></>;
      default: return null;
    }
  };

  // Auto-mark read for received messages (only user chats)
  useEffect(() => {
    if (loading || !messages.length || isGroup) return;
    const timer = setTimeout(() => {
      document.querySelectorAll('.chat-message.received').forEach(el => {
        const mid = parseInt(el.dataset.msgId);
        const msg = messages.find(m => m.id === mid);
        if (msg && msg.sender_id === user.id && msg.status !== 'read' && !msg.is_call_log) markRead(mid);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [loading, messages.length, user?.id, isGroup]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [], today = new Date(), yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    let lastDate = null;
    messages.forEach(msg => {
      const d = new Date(msg.created_at);
      const key = d.toDateString() === today.toDateString() ? 'Today'
                : d.toDateString() === yest.toDateString() ? 'Yesterday'
                : d.toLocaleDateString();
      if (key !== lastDate) { groups.push({ type: 'date', label: key }); lastDate = key; }
      groups.push({ type: 'message', message: msg });
    });
    return groups;
  }, [messages]);

  // Render item for Virtuoso
  const renderItem = useCallback((index, groupItem) => {
    if (groupItem.type === 'date') {
      return <div key={`date-${groupItem.label}`} className="chat-date-separator">{groupItem.label}</div>;
    }
    const msg = groupItem.message;
    const isOwn = msg.sender_id === getCurrentUserId();
    const showSender = isGroup && !msg.is_system_message && !isOwn;
    return (
      <MessageBubble
        key={msg.id}
        msg={msg}
        isOwn={isOwn}
        user={user}
        showSender={showSender}
        isGroup={isGroup}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onForward={handleForward}
        onDelete={handleDelete}
        onDownloadFile={downloadFile}
        editingMessageId={editingMessageId}
        editContent={editContent}
        setEditContent={setEditContent}
        saveEdit={saveEdit}
        setEditingMessageId={setEditingMessageId}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        menuRef={menuRef}
        handleTouchStart={handleTouchStart}
        handleTouchEnd={handleTouchEnd}
        renderStatus={renderStatus}
        fmtTime={fmtTime}
        markRead={markRead}
        onReply={handleReply}
        onScrollToMessage={scrollToMessage}
      />
    );
  }, [user, isGroup, editingMessageId, editContent, openMenuId, messages]);

  // Drag window (desktop)
  const handleMouseDown = (e) => {
    if (e.target.closest('.chat-window-header-actions')) return;
    const r = windowRef.current.getBoundingClientRect();
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: r.left, origY: r.top };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
  };
  const onDragMove = (e) => {
    if (!dragState.current.dragging) return;
    windowRef.current.style.left = `${dragState.current.origX + e.clientX - dragState.current.startX}px`;
    windowRef.current.style.top = `${dragState.current.origY + e.clientY - dragState.current.startY}px`;
    windowRef.current.style.right = 'auto';
    windowRef.current.style.bottom = 'auto';
  };
  const onDragUp = () => {
    dragState.current.dragging = false;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
  };

  // ======== RENDER ========
  return (
    <div ref={windowRef} className="chat-window" style={style}>
      {/* Header */}
      <div className="chat-window-header" onMouseDown={handleMouseDown} style={{ cursor: 'grab', userSelect: 'none' }}>
        <span className="d-flex align-items-center">
          {isGroup ? (
            <>
              {group.profile_picture ? (
                <img src={group.profile_picture} alt={group.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', marginRight: 8 }} />
              ) : (
                <i className="fas fa-users" style={{ fontSize: 20, marginRight: 8, color: '#fff' }} />
              )}
              {group.name}
            </>
          ) : (
            <>
              <span onClick={() => setShowAvatarPreview(true)} style={{ cursor: 'pointer' }}>
                <Avatar user={user} size={32} className="me-2" />
              </span>
              {user.username}
              <span style={{ marginLeft: 8, fontSize: '0.75rem', fontWeight: 'normal', color: onlineUsers.has(user.id) ? '#4caf50' : '#9e9e9e' }}>
                ({onlineUsers.has(user.id) ? 'online' : 'offline'})
              </span>
            </>
          )}
        </span>
        <div className="chat-window-header-actions d-flex align-items-center">
          {isGroup ? (
            <>
              {/* Members hover dropdown */}
              <div
                className="position-relative"
                onMouseEnter={() => setShowMembersDropdown(true)}
                onMouseLeave={() => setShowMembersDropdown(false)}
              >
                <button className="btn btn-sm btn-outline-light me-1" title="Group Members">
                  <i className="fas fa-users" />
                </button>
                {showMembersDropdown && (
                  <div className="group-members-dropdown">
                    {members.map(m => (
                      <div key={m.user_id} className="d-flex align-items-center gap-2 py-1 border-bottom">
                        <Avatar user={{ username: m.username, profile_picture: m.profile_picture }} size={28} />
                        <span>{m.username}</span>
                        {m.user_id === group.created_by && <span className="badge bg-primary ms-auto">Admin</span>}
                      </div>
                    ))}
                    {isGroupAdmin && (
                      <button
                        className="btn btn-sm btn-primary w-100 mt-2"
                        onClick={() => { setShowMembersDropdown(false); setShowAddMemberModal(true); }}
                      >
                        <i className="fas fa-user-plus me-1" /> Add Member
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button className="btn btn-sm btn-outline-danger me-2" onClick={handleLeaveGroup}>
                <i className="fas fa-sign-out-alt" /> Leave
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-outline-light me-1" onClick={() => handleStartCall('voice')} title="Voice Call">
                <i className="fas fa-phone" />
              </button>
              <button className="btn btn-sm btn-outline-light me-1" onClick={() => handleStartCall('video')} title="Video Call">
                <i className="fas fa-video" />
              </button>
              <button className="btn btn-sm btn-outline-light me-1" onClick={() => setShowGroupModal(true)} title="Group Call">
                <i className="fas fa-users" />
              </button>
            </>
          )}
          <button className="btn-close btn-close-white" onClick={onClose} />
        </div>
      </div>

      {/* Virtualized messages */}
      <div className="chat-window-messages" style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div className="text-center py-3"><span className="spinner-border spinner-border-sm me-2" />Loading…</div>
        ) : !groupedMessages.length ? (
          <p className="text-muted text-center py-4">No messages yet.</p>
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={groupedMessages}
            itemContent={renderItem}
            followOutput="smooth"
            atBottomStateChange={atBottom => {
              isUserAtBottom.current = atBottom;
              if (atBottom) { setShowScrollButton(false); setNewMessageCount(0); }
            }}
          />
        )}
      </div>

      {showScrollButton && (
        <button className="new-message-button" onClick={scrollToBottom}>
          <i className="fas fa-arrow-down" />
          {newMessageCount > 0 && <span className="badge bg-white text-dark rounded-pill">{newMessageCount}</span>}
          New messages
        </button>
      )}

      {/* Reply Preview */}
      {replyTo && (
        <div className="reply-preview">
          <div className="reply-preview-content">
            <span className="reply-preview-sender">Replying to {replyTo.sender}</span>
            <span className="reply-preview-text">
              {replyTo.attachment_type?.startsWith('image/') ? '📷 Photo' :
               replyTo.attachment_type?.startsWith('audio/') ? '🎤 Voice message' :
               replyTo.attachment_url ? `📎 ${replyTo.attachment_name || 'File'}` :
               replyTo.content}
            </span>
          </div>
          <button className="reply-preview-close" onClick={() => setReplyTo(null)}>×</button>
        </div>
      )}

      {/* Input bar */}
      <div className="chat-window-input" style={{ position: 'relative' }}>
        <button className="btn btn-link p-1" onClick={() => setShowEmojiPicker(v => !v)}>
          <i className="far fa-smile" />
        </button>
        <input type="text" className="form-control" placeholder="Type a message…"
          value={newMessage} onChange={e => setNewMessage(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && !isRecording && sendMessage()} />
        <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }}
          onChange={e => setAttachments(Array.from(e.target.files))} />
        <button className="btn btn-link p-1" onClick={() => fileInputRef.current.click()} title="Attach">
          <i className="fas fa-paperclip" />
        </button>

        <div className="mic-container" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <button className="btn btn-link p-1" onClick={toggleRecording}
            title={isRecording ? 'Stop recording' : 'Start voice note'}
            style={{ color: isRecording ? '#dc3545' : undefined }}>
            <i className={`fas fa-${isRecording ? 'stop-circle' : 'microphone'}`} />
          </button>
          {isRecording && (
            <>
              <LiveWaveform analyserNode={analyserNode} />
              <span style={{ fontSize: '0.7rem', color: '#dc3545', minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>
                {fmtDur(liveDuration)}
              </span>
            </>
          )}
        </div>

        <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={sending || isRecording}>
          {sending ? <span className="spinner-border spinner-border-sm" /> : <i className="fas fa-paper-plane" />}
        </button>

        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 9999 }}>
            <EmojiPicker onEmojiClick={e => setNewMessage(p => (p || '') + e.emoji)} />
          </div>
        )}
      </div>

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="attachment-preview">
          {attachments.map((file, i) => (
            <div key={i} className="attachment-item">
              <i className={`fas fa-${file.type.startsWith('image/') ? 'image' : 'file'} me-1`} />
              <span className="text-truncate" style={{ maxWidth: 120 }}>{file.name}</span>
              <button className="btn btn-sm ms-1" onClick={() => setAttachments(p => p.filter((_, j) => j !== i))}>&times;</button>
            </div>
          ))}
        </div>
      )}

      {/* Voice confirm */}
      {showVoiceConfirm && (
        <div style={{
          position: 'absolute', bottom: 70, left: 10, right: 10, background: 'white',
          padding: '8px 14px', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 1100, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.9rem' }}>
            <i className="fas fa-microphone me-2 text-danger" />
            Voice note &nbsp;<strong>{fmtDur(finalDuration)}</strong>
          </span>
          <div>
            <button className="btn btn-sm btn-success me-2" onClick={confirmAndSendVoice}>Send</button>
            <button className="btn btn-sm btn-danger" onClick={cancelVoice}>Cancel</button>
          </div>
        </div>
      )}

      <ForwardModal isOpen={showForwardModal} onClose={() => setShowForwardModal(false)}
        message={forwardMessage} onForward={forwardToUsers} />

      {showDeleteConfirm && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 2000 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Delete message</h5>
                <button type="button" className="btn-close" onClick={() => setShowDeleteConfirm(false)} />
              </div>
              <div className="modal-body"><p>Are you sure you want to delete this message?</p></div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GroupCallModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onStartGroupCall={handleStartGroupCall}
        onlineUsers={onlineUsers}
      />

      {/* Avatar Preview Modal */}
      {!isGroup && (
        <Modal
          isOpen={showAvatarPreview}
          onClose={() => setShowAvatarPreview(false)}
          title="Profile Picture"
          size="md"
        >
          <div className="text-center">
            {user.profile_picture ? (
              <img
                src={user.profile_picture}
                alt={user.username}
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  borderRadius: '8px',
                  objectFit: 'contain'
                }}
              />
            ) : (
              <div
                style={{
                  width: '200px',
                  height: '200px',
                  borderRadius: '50%',
                  backgroundColor: '#e9ecef',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  fontSize: '80px',
                  fontWeight: 'bold',
                  color: '#6c757d'
                }}
              >
                {user.username?.charAt(0).toUpperCase() || '?'}
              </div>
            )}
            <p className="mt-2"><strong>{user.username}</strong></p>
          </div>
        </Modal>
      )}

      {/* Group Members Modal (fallback) */}
      {isGroup && (
        <Modal
          isOpen={showMembersModal}
          onClose={() => setShowMembersModal(false)}
          title="Group Members"
          size="md"
        >
          <div>
            {members.map(member => {
              const isYou = member.user_id === getCurrentUserId();
              const isAdmin = member.user_id === group.created_by;
              return (
                <div key={member.user_id} className="d-flex align-items-center gap-3 py-2 border-bottom">
                  <Avatar user={{ username: member.username, profile_picture: member.profile_picture }} size={36} />
                  <div className="flex-grow-1">
                    <span className="fw-semibold">{member.username}</span>
                    {isAdmin && <span className="badge bg-primary ms-2">Admin</span>}
                    {isYou && <span className="badge bg-success ms-2">You</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Leave Group Confirmation */}
      <ConfirmationDialog
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onConfirm={confirmLeaveGroup}
        title="Leave Group"
        message={`Are you sure you want to leave "${group?.name}"?`}
        confirmText="Leave"
        confirmColor="danger"
      />

      {/* Add Member Modal */}
      <AddParticipantModal
        isOpen={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        onAdd={handleAddMember}
        currentParticipants={members.map(m => m.user_id)}
        onlineUsers={onlineUsers}
        title="Add Member"
      />
    </div>
  );
}

export default ChatWindow;
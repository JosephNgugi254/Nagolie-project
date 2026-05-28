import { useState, useEffect, useRef } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import EmojiPicker from 'emoji-picker-react';

// ---------- Waveform Audio Player ----------
function WaveformAudioPlayer({ src }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformData, setWaveformData] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioBlobRef = useRef(null);

  const loadAudio = async () => {
    setLoading(true);
    setLoadError(null);
    setUseFallback(false);
    try {
      let fullUrl = src;
      if (!src.startsWith('http')) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const baseWithoutApi = API_BASE.replace(/\/api\/?$/, '');
        fullUrl = `${baseWithoutApi}${src}`;
      }
      const token = localStorage.getItem('token');
      const response = await fetch(fullUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Empty audio file');
      audioBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (err) {
      console.error('Failed to load voice note:', err);
      setLoadError(err.message);
      showToast.error('Could not load voice note');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudio();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [src]);

  // Generate waveform from blob; fall back to native <audio> if decode fails
  useEffect(() => {
    if (!audioBlobRef.current || !audioUrl || useFallback) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const reader = new FileReader();

    reader.onload = () => {
      audioContext.decodeAudioData(reader.result)
        .then((decoded) => {
          // Duration from decoded PCM is always accurate
          setDuration(decoded.duration);

          const rawData = decoded.getChannelData(0);
          const samples = 100;
          const blockSize = Math.floor(rawData.length / samples);
          const amplitudes = [];
          for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(rawData[i * blockSize + j] || 0);
            }
            amplitudes.push(sum / blockSize);
          }
          const max = Math.max(...amplitudes, 0.001);
          const normalized = amplitudes.map(a => a / max);
          setWaveformData(normalized);
          drawWaveform(normalized, 0);
          if (audioRef.current) audioRef.current.src = audioUrl;
        })
        .catch((err) => {
          console.warn('Waveform decode failed, switching to fallback player:', err);
          setUseFallback(true);
          if (audioRef.current) audioRef.current.src = audioUrl;
        });
    };
    reader.readAsArrayBuffer(audioBlobRef.current);
  }, [audioUrl]);

  const drawWaveform = (data, progressPercent = 0) => {
    if (!canvasRef.current || !data) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const barWidth = width / data.length;
    const playedUpTo = Math.floor(data.length * progressPercent);
    for (let i = 0; i < data.length; i++) {
      const barHeight = Math.max(2, data[i] * height * 0.8);
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      ctx.fillStyle = i < playedUpTo ? '#34b7f1' : '#d3d3d3';
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }
  };

  useEffect(() => {
    if (useFallback) return;
    const audio = audioRef.current;
    if (!audio || !waveformData) return;

    const updateProgress = () => {
      if (audio.duration && isFinite(audio.duration)) {
        const percent = audio.currentTime / audio.duration;
        drawWaveform(waveformData, percent);
        setCurrentTime(audio.currentTime);
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      drawWaveform(waveformData, 0);
      setCurrentTime(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };

    if (isPlaying) {
      updateProgress();
      audio.addEventListener('ended', handleEnded);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audio.duration && isFinite(audio.duration)) {
        drawWaveform(waveformData, audio.currentTime / audio.duration);
      }
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isPlaying, waveformData, useFallback]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(err => {
        if (err.name !== 'AbortError') console.error('Play failed:', err);
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e) => {
    if (useFallback || !audioRef.current || !waveformData) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const newTime = percent * audioRef.current.duration;
    if (isFinite(newTime)) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      drawWaveform(waveformData, percent);
    }
  };

  const formatTime = (time) => {
    if (!isFinite(time) || time < 0) return '0:00';
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) return <div className="text-muted small">Loading voice note...</div>;
  if (loadError) return (
    <div className="text-danger small">
      Failed to load voice note.
      <button className="btn btn-link btn-sm" onClick={loadAudio}>Retry</button>
    </div>
  );
  if (!audioUrl) return <div className="text-muted small">Preparing voice note...</div>;

  if (useFallback) {
    return (
      <div className="fallback-audio-player">
        <audio controls src={audioUrl} style={{ width: '200px', height: '36px' }} />
      </div>
    );
  }

  if (!waveformData) {
    return <div className="text-muted small">Preparing voice note...</div>;
  }

  return (
    <div className="waveform-audio-player">
      <audio ref={audioRef} preload="metadata" />
      <button className="play-pause-btn-wave" onClick={togglePlay}>
        <i className={`fas fa-${isPlaying ? 'pause' : 'play'}`}></i>
      </button>
      <canvas
        ref={canvasRef}
        width={200}
        height={30}
        className="waveform-canvas"
        onClick={handleSeek}
        style={{ cursor: 'pointer' }}
      />
      <span className="audio-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>
  );
}

// ---------- Live Recording Waveform ----------
function LiveWaveform({ isRecording }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (analyserRef.current) analyserRef.current.disconnect();
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
      const canvas = canvasRef.current;
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        const draw = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(dataArray);
          ctx.clearRect(0, 0, width, height);
          ctx.beginPath();
          ctx.strokeStyle = '#007bff';
          ctx.lineWidth = 2;
          const sliceWidth = width / dataArray.length;
          let x = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 128.0;
            const y = (v * height) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          animationRef.current = requestAnimationFrame(draw);
        };
        draw();
      } catch (err) {
        console.error('Live waveform error', err);
      }
    };
    setup();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (analyserRef.current) analyserRef.current.disconnect();
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [isRecording]);

  if (!isRecording) return null;
  return <canvas ref={canvasRef} width={150} height={30} className="live-waveform" />;
}

// ---------- Forward Modal ----------
function ForwardModal({ isOpen, onClose, message, onForward }) {
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) fetchUsers();
  }, [isOpen]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await recoveryAPI.getUsers();
      const allowedRoles = ['director', 'secretary', 'accountant', 'valuer', 'head_of_it', 'deputy_director'];
      setUsers(res.data.filter(u => allowedRoles.includes(u.role)));
    } catch (err) {
      showToast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleForward = () => {
    if (selectedUsers.length === 0) { showToast.error('Select at least one user'); return; }
    onForward(selectedUsers);
    onClose();
  };

  const filteredUsers = users.filter(u =>
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
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <input type="text" className="form-control mb-3" placeholder="Search users..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {loading ? <div className="text-center py-3">Loading...</div> :
                filteredUsers.length === 0 ? <p className="text-muted">No users found</p> :
                filteredUsers.map(user => (
                  <div key={user.id} className="form-check py-1">
                    <input className="form-check-input" type="checkbox" id={`user-${user.id}`}
                      checked={selectedUsers.includes(user.id)} onChange={() => handleToggleUser(user.id)} />
                    <label className="form-check-label ms-2" htmlFor={`user-${user.id}`}>
                      <strong>{user.username}</strong> ({user.role})
                    </label>
                  </div>
                ))}
            </div>
            <div className="mt-3 text-muted small">
              <i className="fas fa-info-circle me-1"></i>
              Message will be sent as a new message from you to selected users.
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleForward} disabled={selectedUsers.length === 0}>
              Forward ({selectedUsers.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Main ChatWindow ----------
function ChatWindow({ user, onClose, onNewMessage, style, globalSocket, onlineUsers }) {
  // ── Voice recording ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [showVoiceConfirm, setShowVoiceConfirm] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  // finalDuration captures seconds at the moment recording stops (frozen value for the confirm modal)
  const [finalDuration, setFinalDuration] = useState(0);
  const [liveDuration, setLiveDuration] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const liveDurationRef = useRef(0);

  // ── Message states ───────────────────────────────────────────────────────
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

  // ── Message action states ────────────────────────────────────────────────
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [forwardMessage, setForwardMessage] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const menuRef = useRef(null);
  const longPressTimer = useRef(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(null);

  // ── Scroll states ────────────────────────────────────────────────────────
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const isUserAtBottom = useRef(true);
  const scrollContainerRef = useRef(null);
  const hasScrolledToBottomOnLoad = useRef(false);

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

  // Viewport resize
  useEffect(() => {
    if (!windowRef.current) return;
    const handleResize = () => {
      if (windowRef.current)
        windowRef.current.style.height = `${window.visualViewport?.height || window.innerHeight}px`;
    };
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);

  // Socket
  useEffect(() => {
    const socket = globalSocket;
    if (!socket) return;
    socketRef.current = socket;
    setSocketConnected(socket.connected);

    const handleConnect = () => { setSocketConnected(true); socket.emit('join_chat', { other_user_id: user.id }); };
    const handleDisconnect = () => setSocketConnected(false);
    const handleNewMessage = (data) => {
      const newMsg = data.message;
      const currentId = getCurrentUserId();
      if (
        (newMsg.sender_id === user.id && newMsg.recipient_id === currentId) ||
        (newMsg.sender_id === currentId && newMsg.recipient_id === user.id)
      ) {
        setMessages(prev => [...prev, newMsg]);
        if (newMsg.sender_id === user.id && newMsg.status !== 'read') markMessageAsRead(newMsg.id);
        if (isUserAtBottom.current) scrollToBottom();
        else { setNewMessageCount(prev => prev + 1); setShowScrollButton(true); }
      }
    };
    const handleMessageStatusUpdate = (data) => {
      setMessages(prev => prev.map(msg => msg.id === data.message_id ? { ...msg, status: data.status } : msg));
    };
    const handleMessageSent = (data) => {
      if (window.sendTimeout) clearTimeout(window.sendTimeout);
      setSending(false);
      setMessages(prev => prev.map(msg => msg.id === data.message_id ? { ...msg, status: data.status } : msg));
      scrollToBottom();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('new_message', handleNewMessage);
    socket.on('message_status_update', handleMessageStatusUpdate);
    socket.on('message_sent', handleMessageSent);
    if (socket.connected) socket.emit('join_chat', { other_user_id: user.id });

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('new_message', handleNewMessage);
      socket.off('message_status_update', handleMessageStatusUpdate);
      socket.off('message_sent', handleMessageSent);
      if (socket.connected) socket.emit('leave_chat', { other_user_id: user.id });
    };
  }, [globalSocket, user.id]);

  const markMessageAsRead = async (messageId) => {
    try {
      if (socketRef.current && socketConnected) socketRef.current.emit('mark_read', { message_ids: [messageId] });
      await recoveryAPI.markMessageRead(messageId);
    } catch (err) { console.error('Failed to mark read', err); }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 50;
      isUserAtBottom.current = atBottom;
      if (atBottom) { setShowScrollButton(false); setNewMessageCount(0); }
    };
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const msgElement = entry.target.closest('.chat-message');
            const msgId = parseInt(msgElement?.dataset.msgId);
            const msg = messages.find(m => m.id === msgId);
            if (msg && msg.sender_id === user.id && msg.status !== 'read') markMessageAsRead(msgId);
          }
        });
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll('.chat-message.received').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [messages, user.id]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => {
        document.querySelectorAll('.chat-message.received').forEach(el => {
          const msgId = parseInt(el.dataset.msgId);
          const msg = messages.find(m => m.id === msgId);
          if (msg && msg.sender_id === user.id && msg.status !== 'read') markMessageAsRead(msgId);
        });
      }, 100);
    }
  }, [loading]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(() => fetchMessages(true), 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollButton(false);
    setNewMessageCount(0);
  };

  const fetchMessages = async (isPoll = false) => {
    try {
      const res = await recoveryAPI.getConversation(user.id);
      setMessages(res.data);
      const unreadReceived = res.data.filter(m => !m.read && m.sender_id === user.id);
      if (unreadReceived.length) {
        const ids = unreadReceived.map(m => m.id);
        if (socketRef.current && socketConnected) socketRef.current.emit('mark_read', { message_ids: ids });
        onNewMessage();
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!loading && messages.length > 0 && !hasScrolledToBottomOnLoad.current) {
      setTimeout(() => { scrollToBottom(); hasScrolledToBottomOnLoad.current = true; }, 200);
    }
  }, [loading, messages]);

  const sendMessage = async () => {
    const contentToSend = newMessage;
    const attachmentsToSend = attachments;
    if ((!contentToSend?.trim()) && attachmentsToSend.length === 0) return;

    setSending(true);
    const tempId = Date.now();
    const currentId = getCurrentUserId();
    const optimisticMsg = {
      id: tempId, sender_id: currentId, recipient_id: user.id, content: contentToSend,
      status: 'sending', created_at: new Date().toISOString(), attachment_url: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    scrollToBottom();
    setNewMessage('');
    setAttachments([]);

    try {
      let attachmentUrl = null, attachmentType = null, attachmentName = null;
      if (attachmentsToSend.length > 0) {
        const formData = new FormData();
        attachmentsToSend.forEach(file => formData.append('files', file));
        const uploadRes = await recoveryAPI.uploadMessageAttachment(formData);
        const firstUpload = uploadRes.data.uploads[0];
        attachmentUrl = firstUpload.url;
        attachmentType = firstUpload.mime_type;
        attachmentName = firstUpload.filename;
      }

      if (socketRef.current && socketConnected) {
        window.sendTimeout = setTimeout(() => {
          setSending(false);
          showToast.error('Message sending timed out');
          setMessages(prev => prev.filter(m => m.id !== tempId));
        }, 15000);
        socketRef.current.emit('send_message', {
          recipient_id: user.id, content: contentToSend,
          attachment_url: attachmentUrl, attachment_type: attachmentType, attachment_name: attachmentName,
        });
      } else {
        await recoveryAPI.sendMessage(user.id, contentToSend, attachmentUrl, attachmentType, attachmentName);
        setSending(false);
        fetchMessages();
      }
    } catch (err) {
      console.error('Send error:', err);
      showToast.error(`Failed to send: ${err.message}`);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    }
  };

  // ── Voice recording: click to start, click again to stop ─────────────────
  const getBestMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getBestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      liveDurationRef.current = 0;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Stop the live timer and capture the frozen duration
        clearInterval(recordTimerRef.current);
        const frozenDuration = liveDurationRef.current;
        setFinalDuration(frozenDuration);
        setLiveDuration(0);
        stream.getTracks().forEach(t => t.stop());

        const chunks = audioChunksRef.current;
        if (!chunks.length) {
          showToast.error('No audio was captured');
          return;
        }

        // Use the native blob directly — no WAV conversion needed.
        // The browser recorded it; the browser can play it back perfectly.
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setShowVoiceConfirm(true);
      };

      // Request data every second so ondataavailable fires even on short recordings
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setLiveDuration(0);
      liveDurationRef.current = 0;

      // Tick every second while recording
      recordTimerRef.current = setInterval(() => {
        liveDurationRef.current += 1;
        setLiveDuration(liveDurationRef.current);
      }, 1000);
    } catch (err) {
      console.error('Mic error:', err);
      showToast.error('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.stop(); // triggers onstop above
    setIsRecording(false);
    // Timer is cleared inside onstop
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const confirmAndSendVoice = async () => {
    if (!recordedBlob) return;
    setShowVoiceConfirm(false);

    // Name the file with the correct extension for the MIME type
    const ext = recordedBlob.type.includes('ogg') ? 'ogg'
               : recordedBlob.type.includes('mp4') ? 'mp4'
               : 'webm';
    const voiceFile = new File([recordedBlob], `voice_${Date.now()}.${ext}`, { type: recordedBlob.type });

    setSending(true);
    const tempId = Date.now();
    const currentId = getCurrentUserId();
    const optimisticMsg = {
      id: tempId, sender_id: currentId, recipient_id: user.id, content: '🎤 Voice message',
      status: 'sending', created_at: new Date().toISOString(), attachment_url: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    scrollToBottom();

    try {
      const formData = new FormData();
      formData.append('files', voiceFile);
      const uploadRes = await recoveryAPI.uploadMessageAttachment(formData);
      const { url: attachmentUrl, mime_type: attachmentType, filename: attachmentName } = uploadRes.data.uploads[0];

      if (socketRef.current && socketConnected) {
        window.sendTimeout = setTimeout(() => {
          setSending(false);
          showToast.error('Message sending timed out');
          setMessages(prev => prev.filter(m => m.id !== tempId));
        }, 15000);
        socketRef.current.emit('send_message', {
          recipient_id: user.id, content: '🎤 Voice message',
          attachment_url: attachmentUrl, attachment_type: attachmentType, attachment_name: attachmentName,
        });
      } else {
        await recoveryAPI.sendMessage(user.id, '🎤 Voice message', attachmentUrl, attachmentType, attachmentName);
        setSending(false);
        fetchMessages();
      }
    } catch (err) {
      console.error('Send voice error:', err);
      showToast.error('Failed to send voice note');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    } finally {
      setRecordedBlob(null);
    }
  };

  const cancelVoice = () => {
    setShowVoiceConfirm(false);
    setRecordedBlob(null);
  };

  // Download file
  const downloadFile = async (url, originalFilename, mimeType) => {
    try {
      let fullUrl = url;
      if (!url.startsWith('http')) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        fullUrl = `${API_BASE.replace(/\/api\/?$/, '')}${url}`;
      }
      const isCloudinary = fullUrl.includes('cloudinary.com');
      const headers = isCloudinary ? {} : { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const response = await fetch(fullUrl, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = originalFilename || `attachment.${mimeType?.split('/')[1] || 'bin'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    } catch (err) { showToast.error(`Download failed: ${err.message}`); }
  };

  // Message actions
  const handleEditMessage = (msg) => { setEditingMessageId(msg.id); setEditContent(msg.content); setOpenMenuId(null); };
  const saveEditMessage = async (msgId) => {
    if (!editContent.trim()) return;
    try {
      const res = await recoveryAPI.editMessage(msgId, editContent);
      if (res.data.success) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editContent, edited: true } : m));
        setEditingMessageId(null);
        setEditContent('');
        showToast.success('Message edited');
      }
    } catch (err) { showToast.error('Failed to edit message'); }
  };
  const handleDeleteMessage = (msg) => { setDeletingMessage(msg); setShowDeleteConfirm(true); setOpenMenuId(null); };
  const confirmDelete = async () => {
    if (!deletingMessage) return;
    try {
      await recoveryAPI.deleteMessage(deletingMessage.id);
      setMessages(prev => prev.filter(m => m.id !== deletingMessage.id));
      showToast.success('Message deleted');
    } catch (err) { showToast.error('Failed to delete message'); }
    finally { setShowDeleteConfirm(false); setDeletingMessage(null); }
  };
  const handleCopyMessage = (msg) => { navigator.clipboard.writeText(msg.content); showToast.success('Copied to clipboard'); setOpenMenuId(null); };
  const handleForwardMessage = (msg) => { setForwardMessage(msg); setShowForwardModal(true); setOpenMenuId(null); };
  const forwardToUsers = async (selectedUserIds) => {
    if (!forwardMessage) return;
    for (const recipientId of selectedUserIds) {
      try {
        await recoveryAPI.sendMessage(recipientId, `Forwarded: ${forwardMessage.content}`,
          forwardMessage.attachment_url, forwardMessage.attachment_type, forwardMessage.attachment_name);
      } catch (err) { console.error('Forward failed for user', recipientId, err); }
    }
    showToast.success(`Forwarded to ${selectedUserIds.length} user(s)`);
    setForwardMessage(null);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpenMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleTouchStart = (msgId) => { longPressTimer.current = setTimeout(() => setOpenMenuId(msgId), 500); };
  const handleTouchEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

  const renderMessageStatus = (msg) => {
    if (msg.sender_id !== getCurrentUserId()) return null;
    switch (msg.status) {
      case 'sending':   return <i className="fas fa-clock" style={{ fontSize: '0.7rem', opacity: 0.4 }}></i>;
      case 'sent':      return <i className="fas fa-check" style={{ fontSize: '0.7rem', opacity: 0.6 }}></i>;
      case 'delivered': return (<><i className="fas fa-check" style={{ fontSize: '0.7rem' }}></i><i className="fas fa-check" style={{ fontSize: '0.7rem', marginLeft: '-0.2rem' }}></i></>);
      case 'read':      return (<><i className="fas fa-check" style={{ fontSize: '0.7rem', color: '#34b7f1' }}></i><i className="fas fa-check" style={{ fontSize: '0.7rem', color: '#34b7f1', marginLeft: '-0.2rem' }}></i></>);
      default:          return null;
    }
  };

  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const groupMessagesByDate = () => {
    const groups = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    messages.forEach(msg => {
      const date = new Date(msg.created_at);
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

  // Drag
  const handleMouseDown = (e) => {
    if (e.target.closest('.chat-window-header-actions')) return;
    dragState.current = { dragging: true, startX: e.clientX, startY: e.clientY,
      origX: windowRef.current.getBoundingClientRect().left,
      origY: windowRef.current.getBoundingClientRect().top };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  const handleMouseMove = (e) => {
    if (!dragState.current.dragging) return;
    windowRef.current.style.left = `${dragState.current.origX + e.clientX - dragState.current.startX}px`;
    windowRef.current.style.top  = `${dragState.current.origY + e.clientY - dragState.current.startY}px`;
    windowRef.current.style.right = 'auto';
    windowRef.current.style.bottom = 'auto';
  };
  const handleMouseUp = () => {
    dragState.current.dragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div ref={windowRef} className="chat-window" style={style}>
      <div className="chat-window-header" onMouseDown={handleMouseDown} style={{ cursor: 'grab', userSelect: 'none' }}>
        <span>
          <i className="fas fa-grip-lines me-2" style={{ opacity: 0.6 }}></i>
          {user.username}
          <span style={{ marginLeft: 8, fontSize: '0.75rem', fontWeight: 'normal', color: onlineUsers.has(user.id) ? '#4caf50' : '#9e9e9e' }}>
            ({onlineUsers.has(user.id) ? 'online' : 'offline'})
          </span>
        </span>
        <div className="chat-window-header-actions">
          <button className="btn-close btn-close-white" onClick={onClose}></button>
        </div>
      </div>

      <div className="chat-window-messages" ref={scrollContainerRef}>
        {loading ? (
          <div className="text-center py-3"><span className="spinner-border spinner-border-sm me-2"></span>Loading…</div>
        ) : messages.length === 0 ? (
          <p className="text-muted text-center py-4">No messages yet.</p>
        ) : (
          Object.entries(groups).map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="chat-date-separator">{dateKey}</div>
              {msgs.map(msg => {
                const isOwn = msg.sender_id === getCurrentUserId();
                const canEdit = isOwn && !msg.attachment_url;
                return (
                  <div key={msg.id} className={`chat-message ${msg.sender_id === user.id ? 'received' : 'sent'}`}
                    data-msg-id={msg.id} onTouchStart={() => handleTouchStart(msg.id)} onTouchEnd={handleTouchEnd}>
                    <div className="message-bubble" style={msg.sender_id !== getCurrentUserId() && msg.status === 'read' ? { backgroundColor: '#fff3cd' } : {}}>
                      <div className="message-content">
                        {editingMessageId === msg.id ? (
                          <div>
                            <textarea className="form-control form-control-sm" value={editContent}
                              onChange={e => setEditContent(e.target.value)} rows="2" autoFocus />
                            <div className="mt-1">
                              <button className="btn btn-sm btn-primary me-1" onClick={() => saveEditMessage(msg.id)}>Save</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => setEditingMessageId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.content}
                            {msg.attachment_url && msg.attachment_type?.startsWith('image/') && (
                              <div className="message-attachment mt-1 position-relative">
                                <img src={msg.attachment_url} alt="attachment" className="img-fluid rounded" style={{ maxHeight: 200, cursor: 'pointer' }} />
                                <button className="btn btn-sm btn-light download-image-btn"
                                  style={{ position: 'absolute', bottom: 4, right: 4, opacity: 0.85 }}
                                  onClick={() => downloadFile(msg.attachment_url, msg.attachment_name || 'image', msg.attachment_type)}>
                                  <i className="fas fa-download"></i>
                                </button>
                              </div>
                            )}
                            {msg.attachment_url && msg.attachment_type?.startsWith('audio/') && (
                              <div className="message-attachment mt-2">
                                <WaveformAudioPlayer src={msg.attachment_url} />
                              </div>
                            )}
                            {msg.attachment_url && !msg.attachment_type?.startsWith('image/') && !msg.attachment_type?.startsWith('audio/') && (
                              <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 mt-1"
                                onClick={() => downloadFile(msg.attachment_url, msg.attachment_name || 'file', msg.attachment_type)}>
                                <i className="fas fa-file-download"></i>
                                <span className="text-truncate" style={{ maxWidth: 160 }}>{msg.attachment_name || 'Download file'}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <div className="message-time">
                        {formatTime(msg.created_at)}
                        {msg.sender_id === getCurrentUserId() && <span className="message-status ms-1">{renderMessageStatus(msg)}</span>}
                        {msg.edited && <span className="ms-1 text-muted small">(edited)</span>}
                      </div>
                      {isOwn && (
                        <div className="message-actions-dropdown">
                          <i className="fas fa-ellipsis-v" onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === msg.id ? null : msg.id); }} />
                          {openMenuId === msg.id && (
                            <div className="message-actions-menu" ref={menuRef}>
                              {canEdit && <button onClick={() => handleEditMessage(msg)}><i className="fas fa-edit"></i> Edit</button>}
                              <button onClick={() => handleCopyMessage(msg)}><i className="fas fa-copy"></i> Copy</button>
                              <button onClick={() => handleForwardMessage(msg)}><i className="fas fa-share"></i> Forward</button>
                              <button onClick={() => handleDeleteMessage(msg)}><i className="fas fa-trash"></i> Delete</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollButton && (
        <button className="new-message-button" onClick={scrollToBottom}>
          <i className="fas fa-arrow-down"></i>
          {newMessageCount > 0 && <span className="badge bg-white text-dark rounded-pill">{newMessageCount}</span>}
          New messages
        </button>
      )}

      <div className="chat-window-input" style={{ position: 'relative' }}>
        <button className="btn btn-link p-1" onClick={() => setShowEmojiPicker(v => !v)}>
          <i className="far fa-smile"></i>
        </button>
        <input type="text" className="form-control" placeholder="Type a message…" value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && !isRecording && sendMessage()} />
        <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }}
          onChange={e => setAttachments(Array.from(e.target.files))} />
        <button className="btn btn-link p-1" onClick={() => fileInputRef.current.click()} title="Attach file">
          <i className="fas fa-paperclip"></i>
        </button>

        {/* Mic button — click once to start, click again to stop */}
        <div className="mic-container" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="btn btn-link p-1"
            onClick={toggleRecording}
            title={isRecording ? 'Stop recording' : 'Start voice note'}
            style={{ color: isRecording ? '#dc3545' : undefined }}
          >
            <i className={`fas fa-${isRecording ? 'stop-circle' : 'microphone'}`}></i>
          </button>
          {/* Show live waveform + ticking counter only while actively recording */}
          {isRecording && (
            <>
              <LiveWaveform isRecording={isRecording} />
              <span style={{ fontSize: '0.7rem', color: '#dc3545', minWidth: 28 }}>{formatDuration(liveDuration)}</span>
            </>
          )}
        </div>

        <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={sending || isRecording}>
          {sending ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-paper-plane"></i>}
        </button>

        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 9999 }}>
            <EmojiPicker onEmojiClick={emoji => setNewMessage(prev => (prev || '') + emoji.emoji)} />
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="attachment-preview">
          {attachments.map((file, i) => (
            <div key={i} className="attachment-item">
              <i className={`fas fa-${file.type.startsWith('image/') ? 'image' : 'file'} me-1`}></i>
              <span className="text-truncate" style={{ maxWidth: 120 }}>{file.name}</span>
              <button className="btn btn-sm ms-1" onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}>&times;</button>
            </div>
          ))}
        </div>
      )}

      {/* Voice confirm modal — shows frozen duration from when recording stopped */}
      {showVoiceConfirm && (
        <div className="voice-confirm-modal" style={{
          position: 'absolute', bottom: 70, left: 10, right: 10,
          background: 'white', padding: 10, borderRadius: 8,
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)', zIndex: 1100,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>
            <i className="fas fa-microphone me-2 text-danger"></i>
            Voice note — {formatDuration(finalDuration)}
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
                <button type="button" className="btn-close" onClick={() => setShowDeleteConfirm(false)}></button>
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
    </div>
  );
}

export default ChatWindow;
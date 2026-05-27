import { useState, useEffect, useRef } from 'react';
import { recoveryAPI } from '../../services/api';
import { showToast } from '../common/Toast';
import EmojiPicker from 'emoji-picker-react';

// ---------- Waveform Audio Player with retry on error ----------
function WaveformAudioPlayer({ src }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveformData, setWaveformData] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const loadAudio = async () => {
    setLoading(true);
    setLoadError(null);
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
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [src]);

  // Decode audio and generate waveform (only if we have a valid audioUrl)
  useEffect(() => {
    if (!audioUrl) return;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    fetch(audioUrl)
      .then(res => res.arrayBuffer())
      .then(buffer => audioContext.decodeAudioData(buffer))
      .then(decoded => {
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
        const max = Math.max(...amplitudes);
        const normalized = amplitudes.map(a => a / max);
        setWaveformData(normalized);
        drawWaveform(normalized, 0);
      })
      .catch(err => {
        console.error('Waveform generation failed', err);
        setLoadError('Failed to process audio');
      });
  }, [audioUrl]);

  const drawWaveform = (data, progressPercent = 0) => {
    if (!canvasRef.current || !data) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const barWidth = width / data.length;
    const playedUpTo = Math.floor(data.length * progressPercent);
    for (let i = 0; i < data.length; i++) {
      const barHeight = data[i] * height * 0.8;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      const isPlayed = i < playedUpTo;
      ctx.fillStyle = isPlayed ? '#34b7f1' : '#d3d3d3';
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
  };

  // Update waveform and time during playback, handle ended event
  useEffect(() => {
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
        const percent = audio.currentTime / audio.duration;
        drawWaveform(waveformData, percent);
      }
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isPlaying, waveformData]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !waveformData) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.min(1, Math.max(0, clickX / rect.width));
    const newTime = percent * audioRef.current.duration;
    if (isFinite(newTime)) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      drawWaveform(waveformData, percent);
    }
  };

  const formatTime = (time) => {
    if (!isFinite(time) || time <= 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  if (loading) {
    return <div className="text-muted small">Loading voice note...</div>;
  }

  if (loadError) {
    return (
      <div className="text-danger small">
        Failed to load voice note.
        <button className="btn btn-link btn-sm" onClick={loadAudio}>Retry</button>
      </div>
    );
  }

  if (!audioUrl || !waveformData) {
    return <div className="text-muted small">Preparing voice note...</div>;
  }

  return (
    <div className="waveform-audio-player">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
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
      <span className="audio-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

// ---------- Live Recording Waveform (unchanged) ----------
function LiveWaveform({ isRecording }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
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
        const width = canvas.width;
        const height = canvas.height;

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
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
    };
  }, [isRecording]);

  if (!isRecording) return null;
  return <canvas ref={canvasRef} width={150} height={30} className="live-waveform" />;
}

// ---------- Main ChatWindow Component (unchanged) ----------
function ChatWindow({ user, onClose, onNewMessage, style, globalSocket, onlineUsers }) {
  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [showVoiceConfirm, setShowVoiceConfirm] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const recordTimer = useRef(null);

  // Message states
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

  // Viewport resize
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

  // Socket events
  useEffect(() => {
    const socket = globalSocket;
    if (!socket) return;
    socketRef.current = socket;
    setSocketConnected(socket.connected);

    const handleConnect = () => {
      console.log('[ChatWindow] Socket connected');
      setSocketConnected(true);
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
      if (window.sendTimeout) clearTimeout(window.sendTimeout);
      setSending(false);
      setMessages(prev =>
        prev.map(msg => msg.id === data.message_id ? { ...msg, status: data.status } : msg)
      );
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

  // Mark as read
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

  // IntersectionObserver for read receipts
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

  // Polling fallback
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

  // Send message (text, image, file, voice)
  const sendMessage = async (customContent = null, customAttachments = null) => {
    const contentToSend = customContent !== null ? customContent : newMessage;
    const attachmentsToSend = customAttachments !== null ? customAttachments : attachments;
    if (!contentToSend.trim() && attachmentsToSend.length === 0) return;

    setSending(true);
    const tempId = Date.now();
    const currentId = getCurrentUserId();

    const optimisticMsg = {
      id: tempId,
      sender_id: currentId,
      recipient_id: user.id,
      content: contentToSend,
      status: 'sending',
      created_at: new Date().toISOString(),
      attachment_url: null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    scrollToBottom();

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
          if (sending) {
            setSending(false);
            showToast.error('Message sending timed out');
            setMessages(prev => prev.filter(m => m.id !== tempId));
          }
        }, 15000);
        socketRef.current.emit('send_message', {
          recipient_id: user.id,
          content: contentToSend,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          attachment_name: attachmentName,
        });
      } else {
        await recoveryAPI.sendMessage(user.id, contentToSend, attachmentUrl, attachmentType, attachmentName);
        setSending(false);
        fetchMessages();
      }

      if (customContent === null) {
        setNewMessage('');
        setAttachments([]);
      }
    } catch (err) {
      console.error('Send message error:', err);
      showToast.error(`Failed to send: ${err.message}`);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setSending(false);
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      setAudioChunks([]);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks(prev => [...prev, event.data]);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        setRecordedBlob(blob);
        setShowVoiceConfirm(true);
        stream.getTracks().forEach(track => track.stop());
      };
      recorder.start(1000);
      setIsRecording(true);
      setRecordDuration(0);
      recordTimer.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      showToast.error('Microphone access denied or unavailable');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
      clearInterval(recordTimer.current);
    }
  };

  const confirmAndSendVoice = async () => {
    if (!recordedBlob) return;
    const voiceFile = new File([recordedBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
    setShowVoiceConfirm(false);
    await sendMessage('🎤 Voice message', [voiceFile]);
    setRecordedBlob(null);
  };

  const cancelVoice = () => {
    setShowVoiceConfirm(false);
    setRecordedBlob(null);
  };

  // Download file (for images and generic files)
  const downloadFile = async (url, originalFilename, mimeType) => {
    try {
      let fullUrl = url;
      if (!url.startsWith('http')) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
        const baseWithoutApi = API_BASE.replace(/\/api\/?$/, '');
        fullUrl = `${baseWithoutApi}${url}`;
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
    } catch (err) {
      showToast.error(`Download failed: ${err.message}`);
    }
  };

  // Message status ticks
  const renderMessageStatus = (msg) => {
    if (msg.sender_id !== getCurrentUserId()) return null;
    switch (msg.status) {
      case 'sending': return <i className="fas fa-clock" style={{ fontSize: '0.7rem', opacity: 0.4 }}></i>;
      case 'sent': return <i className="fas fa-check" style={{ fontSize: '0.7rem', opacity: 0.6 }}></i>;
      case 'delivered': return (
        <>
          <i className="fas fa-check" style={{ fontSize: '0.7rem' }}></i>
          <i className="fas fa-check" style={{ fontSize: '0.7rem', marginLeft: '-0.2rem' }}></i>
        </>
      );
      case 'read': return (
        <>
          <i className="fas fa-check" style={{ fontSize: '0.7rem', color: '#34b7f1' }}></i>
          <i className="fas fa-check" style={{ fontSize: '0.7rem', color: '#34b7f1', marginLeft: '-0.2rem' }}></i>
        </>
      );
      default: return null;
    }
  };

  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

  // Drag handling
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

      <div className="chat-window-messages">
        {loading ? (
          <div className="text-center py-3"><span className="spinner-border spinner-border-sm me-2"></span>Loading…</div>
        ) : messages.length === 0 ? (
          <p className="text-muted text-center py-4">No messages yet.</p>
        ) : (
          Object.entries(groups).map(([dateKey, msgs]) => (
            <div key={dateKey}>
              <div className="chat-date-separator">{dateKey}</div>
              {msgs.map(msg => (
                <div key={msg.id} className={`chat-message ${msg.sender_id === user.id ? 'received' : 'sent'}`} data-msg-id={msg.id}>
                  <div className="message-bubble" style={msg.sender_id !== getCurrentUserId() && msg.status === 'read' ? { backgroundColor: '#fff3cd' } : {}}>
                    <div className="message-content">
                      {msg.content}

                      {/* Image attachment */}
                      {msg.attachment_url && msg.attachment_type?.startsWith('image/') && (
                        <div className="message-attachment mt-1 position-relative">
                          <img src={msg.attachment_url} alt="attachment" className="img-fluid rounded" style={{ maxHeight: 200, cursor: 'pointer' }} />
                          <button className="btn btn-sm btn-light download-image-btn" style={{ position: 'absolute', bottom: 4, right: 4, opacity: 0.85 }}
                            onClick={() => downloadFile(msg.attachment_url, msg.attachment_name || 'image', msg.attachment_type)}>
                            <i className="fas fa-download"></i>
                          </button>
                        </div>
                      )}

                      {/* Audio attachment (voice note) */}
                      {msg.attachment_url && msg.attachment_type?.startsWith('audio/') && (
                        <div className="message-attachment mt-2">
                          <WaveformAudioPlayer src={msg.attachment_url} />
                        </div>
                      )}

                      {/* Generic file attachment */}
                      {msg.attachment_url && !msg.attachment_type?.startsWith('image/') && !msg.attachment_type?.startsWith('audio/') && (
                        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 mt-1"
                          onClick={() => downloadFile(msg.attachment_url, msg.attachment_name || 'file', msg.attachment_type)}>
                          <i className="fas fa-file-download"></i>
                          <span className="text-truncate" style={{ maxWidth: 160 }}>{msg.attachment_name || 'Download file'}</span>
                        </button>
                      )}
                    </div>

                    <div className="message-time">
                      {formatTime(msg.created_at)}
                      {msg.sender_id === getCurrentUserId() && <span className="message-status ms-1">{renderMessageStatus(msg)}</span>}
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
        <button className="btn btn-link p-1" onClick={() => setShowEmojiPicker(v => !v)}><i className="far fa-smile"></i></button>
        <input type="text" className="form-control" placeholder="Type a message…" value={newMessage}
          onChange={e => setNewMessage(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMessage()} />
        <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={e => setAttachments(Array.from(e.target.files))} />
        <button className="btn btn-link p-1" onClick={() => fileInputRef.current.click()} title="Attach file"><i className="fas fa-paperclip"></i></button>
        
        {/* Mic button with live waveform */}
        <div className="mic-container" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <button className="btn btn-link p-1" onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
            style={{ position: 'relative' }} title="Press and hold to record voice note">
            <i className="fas fa-microphone"></i>
          </button>
          <LiveWaveform isRecording={isRecording} />
          {isRecording && <span style={{ fontSize: '0.7rem', color: '#dc3545' }}>{recordDuration}s</span>}
        </div>

        <button className="btn btn-primary btn-sm" onClick={sendMessage} disabled={sending}>
          {sending ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-paper-plane"></i>}
        </button>
        {showEmojiPicker && (
          <div style={{ position: 'absolute', bottom: '100%', right: 0, zIndex: 9999 }}>
            <EmojiPicker onEmojiClick={emoji => setNewMessage(prev => prev + emoji.emoji)} />
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

      {showVoiceConfirm && (
        <div className="voice-confirm-modal" style={{ position: 'absolute', bottom: 70, left: 10, right: 10, background: 'white', padding: 10, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.2)', zIndex: 1100, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Voice note ({recordDuration} sec)</span>
          <div>
            <button className="btn btn-sm btn-success me-2" onClick={confirmAndSendVoice}>Send</button>
            <button className="btn btn-sm btn-danger" onClick={cancelVoice}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
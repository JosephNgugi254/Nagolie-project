// components/call/CallScreen.jsx
import React, { useRef, useEffect } from 'react';

const CallScreen = ({
  call,
  localStream,
  remoteStream,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onToggleCamera,
  onAddParticipant,
  duration,
  isMinimized,
  onMinimize,
  isGroup,
  participants,
}) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [muted, setMuted] = React.useState(false);
  const [speaker, setSpeaker] = React.useState(false);
  const [cameraOn, setCameraOn] = React.useState(call?.type === 'video');

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  // Attach remote stream (always – for both video and voice calls)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleToggleMute = () => {
    setMuted(!muted);
    if (localStream) {
      localStream.getAudioTracks().forEach(t => (t.enabled = muted));
    }
    onToggleMute && onToggleMute();
  };

  const handleToggleSpeaker = () => {
    setSpeaker(!speaker);
    onToggleSpeaker && onToggleSpeaker();
  };

  const handleToggleCamera = () => {
    setCameraOn(!cameraOn);
    if (localStream) {
      localStream.getVideoTracks().forEach(t => (t.enabled = cameraOn));
    }
    onToggleCamera && onToggleCamera();
  };

  const isVideoCall = call?.type === 'video';

  return (
    <div className="call-screen-container">
      <div className="call-video-area">
        {/* Remote video/audio – always rendered, hidden for voice calls */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={isVideoCall ? 'remote-video' : 'remote-audio-only'}
          style={isVideoCall ? {} : { display: 'none' }}
        />

        {isVideoCall ? (
          // Video call: show local video (picture‑in‑picture) and remote video (visible)
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="local-video"
          />
        ) : (
          // Voice call: show avatar
          <div className="voice-call-avatar">
            <i className="fas fa-user-circle fa-8x" />
            <h3>{call?.remoteUser?.name || 'User'}</h3>
            <p>{isGroup ? 'Group call' : 'Voice call'}</p>
          </div>
        )}
      </div>

      <div className="call-controls">
        {isGroup && (
          <button className="control-btn" onClick={() => onAddParticipant && onAddParticipant()}>
            <i className="fas fa-user-plus" />
          </button>
        )}
        <button className={`control-btn ${muted ? 'active' : ''}`} onClick={handleToggleMute}>
          <i className={`fas fa-microphone${muted ? '-slash' : ''}`} />
        </button>
        <button className={`control-btn ${speaker ? 'active' : ''}`} onClick={handleToggleSpeaker}>
          <i className={`fas fa-volume-up${speaker ? '' : '-off'}`} />
        </button>
        {isVideoCall && (
          <button className={`control-btn ${cameraOn ? 'active' : ''}`} onClick={handleToggleCamera}>
            <i className={`fas fa-video${cameraOn ? '' : '-slash'}`} />
          </button>
        )}
        <button className="control-btn end-call" onClick={onEnd}>
          <i className="fas fa-phone-slash" />
        </button>
        <button className="control-btn" onClick={onMinimize}>
          <i className="fas fa-window-minimize" />
        </button>
      </div>

      <div className="call-timer">{formatDuration(duration)}</div>
    </div>
  );
};

export default CallScreen;
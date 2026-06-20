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

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
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

  return (
    <div className="call-screen-container">
      <div className="call-video-area">
        {call?.type === 'video' ? (
          <>
            <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
            <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
          </>
        ) : (
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
        {call?.type === 'video' && (
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
import React, { useRef, useEffect } from 'react';
import Avatar from '../common/Avatar';

const ParticipantTile = ({ userId, stream, isVideoCall, userDirectory }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  const info = userDirectory?.[userId];
  return (
    <div className="participant-tile">
      {isVideoCall ? (
        <video ref={ref} autoPlay playsInline className="participant-video" />
      ) : (
        <audio ref={ref} autoPlay />
      )}
      <div className="participant-label">
        <Avatar user={info} size={40} />
        <span>{info?.username || 'User'}</span>
      </div>
    </div>
  );
};

const CallScreen = ({
  call, localStream, remoteStreamsMap, userDirectory,
  onEnd, onToggleMute, onToggleSpeaker, onToggleCamera, onAddParticipant,
  duration, onMinimize, isGroup,
}) => {
  const localVideoRef = useRef(null);
  const [muted, setMuted] = React.useState(false);
  const [speaker, setSpeaker] = React.useState(false);
  const [cameraOn, setCameraOn] = React.useState(call?.type === 'video');

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  const formatDuration = (s) => `${Math.floor(s / 60)}:${(s % 60) < 10 ? '0' : ''}${s % 60}`;
  const isVideoCall = call?.type === 'video';
  const remoteEntries = Object.entries(remoteStreamsMap || {});

  const handleToggleMute = () => {
    setMuted(!muted);
    localStream?.getAudioTracks().forEach(t => (t.enabled = muted));
    onToggleMute?.();
  };
  const handleToggleCamera = () => {
    setCameraOn(!cameraOn);
    localStream?.getVideoTracks().forEach(t => (t.enabled = !cameraOn ? true : false));
    onToggleCamera?.();
  };

  return (
    <div className="call-screen-container">
      <div className={`call-video-area ${isGroup ? 'call-grid' : ''}`}>
        {isGroup ? (
          remoteEntries.length === 0 ? (
            <div className="voice-call-avatar"><p>Waiting for others to join…</p></div>
          ) : (
            remoteEntries.map(([uid, stream]) => (
              <ParticipantTile key={uid} userId={Number(uid)} stream={stream} isVideoCall={isVideoCall} userDirectory={userDirectory} />
            ))
          )
        ) : isVideoCall ? (
          <ParticipantTile userId={call?.remoteUser?.id} stream={remoteEntries[0]?.[1]} isVideoCall userDirectory={userDirectory} />
        ) : (
          <div className="voice-call-avatar">
            <Avatar user={userDirectory?.[call?.remoteUser?.id] || call?.remoteUser} size={140} />
            <h3>{userDirectory?.[call?.remoteUser?.id]?.username || call?.remoteUser?.name || 'User'}</h3>
            <p>Voice call</p>
          </div>
        )}
        {isVideoCall && <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />}
      </div>

      <div className="call-controls">
        {isGroup && (
          <button className="control-btn" onClick={onAddParticipant}><i className="fas fa-user-plus" /></button>
        )}
        <button className={`control-btn ${muted ? 'active' : ''}`} onClick={handleToggleMute}>
          <i className={`fas fa-microphone${muted ? '-slash' : ''}`} />
        </button>
        <button className={`control-btn ${speaker ? 'active' : ''}`} onClick={() => { setSpeaker(!speaker); onToggleSpeaker?.(); }}>
          <i className={`fas fa-volume-up${speaker ? '' : '-off'}`} />
        </button>
        {isVideoCall && (
          <button className={`control-btn ${cameraOn ? 'active' : ''}`} onClick={handleToggleCamera}>
            <i className={`fas fa-video${cameraOn ? '' : '-slash'}`} />
          </button>
        )}
        <button className="control-btn end-call" onClick={onEnd}><i className="fas fa-phone-slash" /></button>
        <button className="control-btn" onClick={onMinimize}><i className="fas fa-window-minimize" /></button>
      </div>
      <div className="call-timer">{formatDuration(duration)}</div>
    </div>
  );
};

export default CallScreen;
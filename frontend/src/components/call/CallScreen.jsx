import React, { useRef, useEffect, useState } from 'react';
import Avatar from '../common/Avatar';

// ---------------------------------------------------------------------------
// ParticipantTile — always plays the stream's audio.
// For video calls the video element handles both audio and video.
// For voice calls a separate hidden <audio> element handles audio.
// ---------------------------------------------------------------------------
const ParticipantTile = ({ userId, stream, isVideoCall, userDirectory }) => {
  const mediaRef = useRef(null);
  const [needsTap, setNeedsTap] = useState(false);
  const info = userDirectory?.[userId];

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !stream) return;

    el.srcObject = stream;
    el.muted = false;            // explicitly unmute

    const tryPlay = () => {
      el.play()
        .then(() => setNeedsTap(false))
        .catch((err) => {
          console.warn('[CallScreen] autoplay blocked:', err?.name, err?.message);
          setNeedsTap(true);
        });
    };
    tryPlay();

    // If the stream gets new tracks later (audio arriving after video), retry
    const onAddTrack = () => tryPlay();
    stream.addEventListener('addtrack', onAddTrack);
    return () => stream.removeEventListener('addtrack', onAddTrack);
  }, [stream]);

  return (
    <div className="participant-tile">
      {isVideoCall ? (
        <video
          ref={mediaRef}
          autoPlay
          playsInline
          className="participant-video"
        />
      ) : (
        <audio ref={mediaRef} autoPlay playsInline />
      )}

      {needsTap && (
        <button
          type="button"
          className="btn btn-sm btn-warning position-absolute"
          style={{ top: 8, right: 8, zIndex: 5 }}
          onClick={() => mediaRef.current?.play().catch(() => {})}
        >
          <i className="fas fa-volume-up me-1" /> Tap to enable audio
        </button>
      )}

      <div className="participant-label">
        <Avatar user={info} size={40} />
        <span>{info?.username || 'User'}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// RemoteAudio — hidden element that plays remote audio for voice calls
// ---------------------------------------------------------------------------
const RemoteAudio = ({ stream }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch((err) => {
      console.warn('[CallScreen] remote audio autoplay blocked:', err?.name);
    });
  }, [stream]);
  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  );
};

const CallScreen = ({
  call, localStream, remoteStreamsMap, userDirectory,
  onEnd, onToggleMute, onToggleSpeaker, onToggleCamera, onAddParticipant,
  duration, onMinimize, isGroup,
}) => {
  const localVideoRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOn, setCameraOn] = useState(call?.type === 'video');

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.muted = true;    // never echo ourselves
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream]);

  const formatDuration = (s) =>
    `${Math.floor(s / 60)}:${(s % 60) < 10 ? '0' : ''}${s % 60}`;
  const isVideoCall = call?.type === 'video';
  const remoteEntries = Object.entries(remoteStreamsMap || {});

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    onToggleMute?.();
  };
  const handleToggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    localStream?.getVideoTracks().forEach((t) => (t.enabled = next));
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
              <React.Fragment key={uid}>
                <ParticipantTile
                  userId={Number(uid)}
                  stream={stream}
                  isVideoCall={isVideoCall}
                  userDirectory={userDirectory}
                />
              </React.Fragment>
            ))
          )
        ) : isVideoCall ? (
          <>
            <ParticipantTile
              userId={call?.remoteUser?.id}
              stream={remoteEntries[0]?.[1]}
              isVideoCall
              userDirectory={userDirectory}
            />
          </>
        ) : (
          <>
            <div className="voice-call-avatar">
              <Avatar
                user={userDirectory?.[call?.remoteUser?.id] || call?.remoteUser}
                size={140}
              />
              <h3>
                {userDirectory?.[call?.remoteUser?.id]?.username ||
                  call?.remoteUser?.name ||
                  'User'}
              </h3>
              <p>Voice call</p>
            </div>
            {remoteEntries.map(([uid, stream]) => (
              <RemoteAudio key={uid} stream={stream} />
            ))}
          </>
        )}

        {isVideoCall && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="local-video"
          />
        )}
      </div>

      <div className="call-controls">
        {isGroup && (
          <button className="control-btn" onClick={onAddParticipant}>
            <i className="fas fa-user-plus" />
          </button>
        )}
        <button
          className={`control-btn ${muted ? 'active' : ''}`}
          onClick={handleToggleMute}
        >
          <i className={`fas fa-microphone${muted ? '-slash' : ''}`} />
        </button>
        <button
          className={`control-btn ${speaker ? 'active' : ''}`}
          onClick={() => { setSpeaker(!speaker); onToggleSpeaker?.(); }}
        >
          <i className={`fas fa-volume-up${speaker ? '' : '-off'}`} />
        </button>
        {isVideoCall && (
          <button
            className={`control-btn ${cameraOn ? 'active' : ''}`}
            onClick={handleToggleCamera}
          >
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
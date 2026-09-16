import React, { useRef, useEffect, useState, useCallback } from 'react';
import Avatar from '../common/Avatar';

// ---------------------------------------------------------------------------
// ParticipantTile — used only for group calls (grid layout)
// ---------------------------------------------------------------------------
const ParticipantTile = ({ userId, stream, isVideoCall, userDirectory }) => {
  const mediaRef = useRef(null);
  const [needsTap, setNeedsTap] = useState(false);
  const info = userDirectory?.[userId];

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.muted = false;

    const tryPlay = () => {
      el.play()
        .then(() => setNeedsTap(false))
        .catch((err) => {
          console.warn('[CallScreen] autoplay blocked:', err?.name, err?.message);
          setNeedsTap(true);
        });
    };
    tryPlay();

    const onAddTrack = () => tryPlay();
    stream.addEventListener('addtrack', onAddTrack);
    return () => stream.removeEventListener('addtrack', onAddTrack);
  }, [stream]);

  return (
    <div className="participant-tile">
      {isVideoCall ? (
        <video ref={mediaRef} autoPlay playsInline className="participant-video" />
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
// RemoteAudio — hidden element that plays remote audio for 1:1 voice calls
// ---------------------------------------------------------------------------
const RemoteAudio = ({ stream }) => {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;

    el.srcObject = stream;
    el.muted = false;

    const tryPlay = () => {
      el.play().catch((err) => {
        console.warn('[RemoteAudio] autoplay blocked:', err?.name);
      });
    };
    tryPlay();

    // Retry if audio tracks arrive after the effect ran
    const onAddTrack = () => tryPlay();
    stream.addEventListener('addtrack', onAddTrack);

    return () => {
      stream.removeEventListener('addtrack', onAddTrack);
      el.pause();
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      // webkit-playsinline is required for iOS Safari to allow inline playback
      webkit-playsinline="true"
      preload="auto"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  );
};

// ---------------------------------------------------------------------------
// CallScreen
// ---------------------------------------------------------------------------
const CallScreen = ({
  call, localStream, remoteStreamsMap, userDirectory,
  onEnd, onToggleMute, onToggleSpeaker, onToggleCamera, onAddParticipant,
  duration, onMinimize, isGroup, isCallConnected,
}) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [isSwapped, setIsSwapped] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(false);
  const [cameraOn, setCameraOn] = useState(call?.type === 'video');
  const [remoteAutoplayBlocked, setRemoteAutoplayBlocked] = useState(false);

  const isVideoCall = call?.type === 'video';
  const remoteEntries = Object.entries(remoteStreamsMap || {});
  const primaryRemoteStream = remoteEntries[0]?.[1];
  const remoteUserId = remoteEntries[0]?.[0];

  // -------------------------------------------------------------------------
  // Sync initial mute/camera state from the actual MediaStreamTracks
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!localStream) return;
    const audioTracks = localStream.getAudioTracks();
    const videoTracks = localStream.getVideoTracks();
    if (audioTracks.length) setMuted(!audioTracks[0].enabled);
    if (videoTracks.length) setCameraOn(videoTracks[0].enabled);
  }, [localStream]);

  // -------------------------------------------------------------------------
  // Attach local stream to the local video element (1:1 video + group video)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    if (el.srcObject !== localStream) el.srcObject = localStream;
    el.muted = true;   // never echo ourselves
    el.play().catch(() => {});
  }, [localStream, isVideoCall]);

  // -------------------------------------------------------------------------
  // Attach remote stream to the remote video element (1:1 video only)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !primaryRemoteStream) return;
    if (el.srcObject !== primaryRemoteStream) el.srcObject = primaryRemoteStream;
    el.play()
      .then(() => setRemoteAutoplayBlocked(false))
      .catch((err) => {
        console.warn('[CallScreen] remote video autoplay blocked:', err?.name);
        setRemoteAutoplayBlocked(true);
      });
  }, [primaryRemoteStream]);

  const formatDuration = (s) =>
    `${Math.floor(s / 60)}:${(s % 60) < 10 ? '0' : ''}${s % 60}`;

  // -------------------------------------------------------------------------
  // Microphone toggle — updates the actual track
  // -------------------------------------------------------------------------
  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    onToggleMute?.();
  };

  // -------------------------------------------------------------------------
  // Camera toggle — updates the actual track (independent of microphone)
  // -------------------------------------------------------------------------
  const handleToggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    localStream?.getVideoTracks().forEach((t) => (t.enabled = next));
    onToggleCamera?.();
  };

  // -------------------------------------------------------------------------
  // Swap main/preview videos — purely a CSS class change, no stream work
  // -------------------------------------------------------------------------
  const handleSwap = useCallback(() => {
    setIsSwapped((s) => !s);
  }, []);

  const handleUnblockRemote = () => {
    remoteVideoRef.current?.play()
      .then(() => setRemoteAutoplayBlocked(false))
      .catch(() => {});
  };

  return (
    <div className="call-screen-container">
      {/* =====================================================================
          1:1 VIDEO CALL — full-screen remote + floating local preview
      ===================================================================== */}
      {!isGroup && isVideoCall && (
        <div className="call-video-stage">
          {/* REMOTE video — main by default, preview when swapped */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={isSwapped ? 'call-video-preview' : 'call-video-main'}
            onClick={isSwapped ? handleSwap : undefined}
            title={isSwapped ? 'Tap to make full screen' : ''}
          />

          {/* LOCAL video — preview by default, main when swapped */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={isSwapped ? 'call-video-main' : 'call-video-preview'}
            onClick={!isSwapped ? handleSwap : undefined}
            title={!isSwapped ? 'Tap to make full screen' : ''}
          />

          {/* Placeholder while the remote side has not connected yet */}
          {!primaryRemoteStream && (
            <div className="call-video-waiting">
              <Avatar
                user={userDirectory?.[call?.remoteUser?.id] || call?.remoteUser}
                size={120}
              />
              <p>Connecting…</p>
            </div>
          )}

          {/* Fallback when mobile autoplay is blocked */}
          {remoteAutoplayBlocked && (
            <button
              type="button"
              className="btn btn-warning btn-sm call-unblock-audio"
              onClick={handleUnblockRemote}
            >
              <i className="fas fa-volume-up me-1" /> Tap to enable audio
            </button>
          )}
        </div>
      )}

      {/* =====================================================================
          GROUP CALL — grid layout, local video stays small
      ===================================================================== */}
      {isGroup && (
        <div className="call-video-area call-grid">
          {remoteEntries.length === 0 ? (
            <div className="voice-call-avatar"><p>Waiting for others to join…</p></div>
          ) : (
            remoteEntries.map(([uid, stream]) => (
              <ParticipantTile
                key={uid}
                userId={Number(uid)}
                stream={stream}
                isVideoCall={isVideoCall}
                userDirectory={userDirectory}
              />
            ))
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
      )}

      {/* =====================================================================
          1:1 VOICE CALL — avatar + hidden audio elements
      ===================================================================== */}
      {!isGroup && !isVideoCall && (
        <div className="call-video-area">
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
        </div>
      )}

      {/* =====================================================================
          CONTROLS
      ===================================================================== */}
      <div className="call-controls">
        {isGroup && (
          <button className="control-btn" onClick={onAddParticipant}>
            <i className="fas fa-user-plus" />
          </button>
        )}

        {/* Microphone — red when muted */}
        <button
          className={`control-btn ${muted ? 'muted' : ''}`}
          onClick={handleToggleMute}
          title={muted ? 'Unmute microphone' : 'Mute microphone'}
          aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          <i className={`fas fa-microphone${muted ? '-slash' : ''}`} />
        </button>

        {/* Speaker */}
        <button
          className={`control-btn ${speaker ? 'active' : ''}`}
          onClick={() => { setSpeaker(!speaker); onToggleSpeaker?.(); }}
          title={speaker ? 'Turn speaker off' : 'Turn speaker on'}
        >
          <i className={`fas ${speaker ? 'fa-volume-high' : 'fa-volume-xmark'}`} />
        </button>

        {/* Camera — only for video calls, independent of microphone */}
        {isVideoCall && (
          <button
            className={`control-btn ${cameraOn ? 'active' : ''}`}
            onClick={handleToggleCamera}
            title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
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

      <div className="call-timer">
        {isCallConnected
          ? formatDuration(duration)
          : call?.status === 'ringing'
            ? 'Ringing…'
            : call?.status === 'connecting'
              ? 'Connecting…'
              : 'Calling…'}
      </div>
    </div>
  );
};

export default CallScreen;
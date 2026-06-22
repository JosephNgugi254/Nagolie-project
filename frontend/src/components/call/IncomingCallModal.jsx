import React, { useState, useEffect } from 'react';

const IncomingCallModal = ({ call, onAnswer, onDecline, onToggleRingtone }) => {
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    // Ringtone is handled by CallContext; this component only UI
  }, []);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    onToggleRingtone && onToggleRingtone();
  };

  if (!call) return null;

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="caller-avatar">
          <i className="fas fa-user-circle fa-5x" />
        </div>
        <h4 className="caller-name">{call.callerName || 'Unknown'}</h4>
        <p className="call-type">{call.type === 'video' ? 'Video Call' : 'Voice Call'} incoming...</p>
        <div className="call-actions">
          <button className="btn-decline" onClick={onDecline}>
            <i className="fas fa-phone-slash" />
          </button>
          <button className="btn-answer" onClick={onAnswer}>
            <i className="fas fa-phone" />
          </button>
          <button className="btn-mute" onClick={toggleMute} style={{ background: 'transparent', border: 'none' }}>
            <i className={`fas fa-volume-${isMuted ? 'mute' : 'up'}`} style={{ fontSize: '1.5rem', color: 'white' }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallModal;
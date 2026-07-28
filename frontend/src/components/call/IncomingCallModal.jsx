import React, { useState } from 'react';
import Avatar from '../common/Avatar';

const IncomingCallModal = ({ call, onAnswer, onDecline, onToggleRingtone }) => {
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    setIsMuted(!isMuted);
    onToggleRingtone && onToggleRingtone();
  };

  if (!call) return null;

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="caller-avatar">
          <Avatar user={{ username: call.callerName, profile_picture: call.callerAvatar }} size={90} />
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
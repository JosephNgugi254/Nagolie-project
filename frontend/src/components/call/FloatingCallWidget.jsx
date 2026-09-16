import React from 'react';
import Avatar from '../common/Avatar';

const FloatingCallWidget = ({ call, duration, onMaximize, onEnd }) => {
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remoteUser = call?.remoteUser || {};

  return (
    <div className="floating-call-widget" onClick={onMaximize}>
      <div className="widget-content">
        <Avatar user={remoteUser} size={28} className="call-icon" />
        <span className="call-name">{remoteUser?.name || 'Call'}</span>

        {/* Live timer */}
        <span className="call-duration" aria-label="Call duration">
          <i className="far fa-clock" style={{ fontSize: '0.75rem', marginRight: 4 }} />
          {formatDuration(duration)}
        </span>

        <button
          className="end-call-btn"
          onClick={(e) => { e.stopPropagation(); onEnd(); }}
          aria-label="End call"
        >
          <i className="fas fa-phone-slash" />
        </button>
      </div>
    </div>
  );
};

export default FloatingCallWidget;
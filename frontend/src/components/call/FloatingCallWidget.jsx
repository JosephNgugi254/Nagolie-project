// components/call/FloatingCallWidget.jsx
import React from 'react';

const FloatingCallWidget = ({ call, duration, onMaximize, onEnd }) => {
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="floating-call-widget" onClick={onMaximize}>
      <div className="widget-content">
        <i className="fas fa-phone-alt call-icon" />
        <span className="call-name">{call?.remoteUser?.name || 'Call'}</span>
        <span className="call-duration">{formatDuration(duration)}</span>
        <button className="end-call-btn" onClick={(e) => { e.stopPropagation(); onEnd(); }}>
          <i className="fas fa-phone-slash" />
        </button>
      </div>
    </div>
  );
};

export default FloatingCallWidget;
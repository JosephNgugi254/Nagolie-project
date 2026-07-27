// components/common/Avatar.jsx
import React from 'react';

const Avatar = ({ user, size = 40, className = '' }) => {
    const username = user?.username || '?';
    const picture = user?.profile_picture;

    if (picture) {
        return (
            <img
                src={picture}
                alt={username}
                className={`rounded-circle ${className}`}
                style={{ width: size, height: size, objectFit: 'cover' }}
            />
        );
    }

    const letter = username.charAt(0).toUpperCase();
    // Consistent color based on username
    const colors = ['#1e40af', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const hash = username.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const color = colors[hash % colors.length];

    return (
        <div
            className={`rounded-circle d-flex align-items-center justify-content-center text-white ${className}`}
            style={{ width: size, height: size, backgroundColor: color }}
        >
            <span style={{ fontSize: size * 0.5, fontWeight: 'bold' }}>{letter}</span>
        </div>
    );
};

export default Avatar;
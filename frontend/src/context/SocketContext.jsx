// context/SocketContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // NEW: { user_id: ISO timestamp }
  const [lastSeen, setLastSeen] = useState({});

  // NEW: { 'user_<id>': { <typer_id>: { username } },
  //         'group_<id>': { <typer_id>: { username }, ... } }
  const [typingUsers, setTypingUsers] = useState({});

  const socketRef = useRef(null);
  const disconnectTimeouts = useRef({});
  const typingTimeouts = useRef({});   // keyed 'user_<id>_<typer>' / 'group_<id>_<typer>'

  const removeTypingEntry = (conversationKey, typerId) => {
    setTypingUsers(prev => {
      const bucket = prev[conversationKey];
      if (!bucket || !(typerId in bucket)) return prev;
      const { [typerId]: _removed, ...rest } = bucket;
      if (Object.keys(rest).length === 0) {
        const { [conversationKey]: _drop, ...outer } = prev;
        return outer;
      }
      return { ...prev, [conversationKey]: rest };
    });
    const tkey = `${conversationKey}_${typerId}`;
    if (typingTimeouts.current[tkey]) {
      clearTimeout(typingTimeouts.current[tkey]);
      delete typingTimeouts.current[tkey];
    }
  };

  useEffect(() => {
    if (!user?.id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }
    if (socketRef.current) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '')
      || (window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://nagolie-backend.onrender.com');

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      pingInterval: 25000,
      pingTimeout: 60000,
      query: { token },
    });

    newSocket.on('connect', () => console.log('[Socket] Connected'));

    newSocket.on('online_users_list', (d) => setOnlineUsers(new Set(d.user_ids)));

    newSocket.on('user_online', (d) => {
      if (disconnectTimeouts.current[d.user_id]) {
        clearTimeout(disconnectTimeouts.current[d.user_id]);
        delete disconnectTimeouts.current[d.user_id];
      }
      setOnlineUsers(prev => new Set([...prev, d.user_id]));
    });

    newSocket.on('user_offline', (d) => {
      // Store last_seen immediately so the UI has it if reconnection doesn't happen.
      if (d.last_seen) {
        setLastSeen(prev => ({ ...prev, [d.user_id]: d.last_seen }));
      }
      if (disconnectTimeouts.current[d.user_id]) clearTimeout(disconnectTimeouts.current[d.user_id]);
      disconnectTimeouts.current[d.user_id] = setTimeout(() => {
        setOnlineUsers(prev => {
          const s = new Set(prev); s.delete(d.user_id); return s;
        });
        delete disconnectTimeouts.current[d.user_id];
      }, 10000);
    });

    // ── Typing ───────────────────────────────────────────────────────────
    newSocket.on('user_typing', (d) => {
      const conversationKey = d.type === 'group'
        ? `group_${d.group_id}`
        : `user_${d.user_id}`;

      setTypingUsers(prev => ({
        ...prev,
        [conversationKey]: {
          ...(prev[conversationKey] || {}),
          [d.user_id]: { username: d.username || 'Someone' },
        },
      }));

      // Safety net: auto-clear if the sender crashes without emitting stop.
      const tkey = `${conversationKey}_${d.user_id}`;
      if (typingTimeouts.current[tkey]) clearTimeout(typingTimeouts.current[tkey]);
      typingTimeouts.current[tkey] = setTimeout(() => {
        removeTypingEntry(conversationKey, d.user_id);
      }, 5000);
    });

    newSocket.on('user_stop_typing', (d) => {
      const conversationKey = d.type === 'group'
        ? `group_${d.group_id}`
        : `user_${d.user_id}`;
      removeTypingEntry(conversationKey, d.user_id);
    });

    newSocket.on('connect_error', (err) => {
      if (err?.message === 'Unauthorized' || err?.data?.code === 401) {
        newSocket.disconnect();
        localStorage.removeItem('token');
        window.location.replace('/login');
      }
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      Object.values(typingTimeouts.current).forEach(clearTimeout);
      typingTimeouts.current = {};
    };
  }, [user?.id]);

  return (
    <SocketContext.Provider value={{ socket, onlineUsers, lastSeen, typingUsers }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
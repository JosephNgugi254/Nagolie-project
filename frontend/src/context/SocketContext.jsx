// context/SocketContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const socketRef = useRef(null);
  const disconnectTimeouts = useRef({});

  useEffect(() => {
    // Connect only when we have a user
    if (!user?.id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }
    if (socketRef.current) return;               // already connected

    const token = localStorage.getItem('token');
    if (!token) return;

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '')
      || (window.location.hostname === 'localhost'
        ? 'http://localhost:5000'
        : 'https://nagolie-backend.onrender.com');

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,            // keep trying
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
      if (disconnectTimeouts.current[d.user_id]) clearTimeout(disconnectTimeouts.current[d.user_id]);
      disconnectTimeouts.current[d.user_id] = setTimeout(() => {
        setOnlineUsers(prev => {
          const s = new Set(prev); s.delete(d.user_id); return s;
        });
        delete disconnectTimeouts.current[d.user_id];
      }, 10000);
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
    };
  }, [user?.id]);         // ← only re-run when the authenticated user changes

  return <SocketContext.Provider value={{ socket, onlineUsers }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
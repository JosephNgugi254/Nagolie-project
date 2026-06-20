// context/SocketContext.jsx
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const socketRef = useRef(null);
  const disconnectTimeouts = useRef({});

  useEffect(() => {
    if (!isAuthenticated() || socketRef.current) return;

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '') || 'http://localhost:5000';
    const token = localStorage.getItem('token');
    if (!token) return;

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      pingInterval: 25000,
      pingTimeout: 60000,
      query: { token },
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected');
    });

    newSocket.on('online_users_list', (data) => {
      setOnlineUsers(new Set(data.user_ids));
    });

    newSocket.on('user_online', (data) => {
      if (disconnectTimeouts.current[data.user_id]) {
        clearTimeout(disconnectTimeouts.current[data.user_id]);
        delete disconnectTimeouts.current[data.user_id];
      }
      setOnlineUsers(prev => new Set([...prev, data.user_id]));
    });

    newSocket.on('user_offline', (data) => {
      if (disconnectTimeouts.current[data.user_id]) {
        clearTimeout(disconnectTimeouts.current[data.user_id]);
      }
      const timeout = setTimeout(() => {
        setOnlineUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(data.user_id);
          return newSet;
        });
        delete disconnectTimeouts.current[data.user_id];
      }, 10000);
      disconnectTimeouts.current[data.user_id] = timeout;
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated]);

  const value = { socket, onlineUsers };
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
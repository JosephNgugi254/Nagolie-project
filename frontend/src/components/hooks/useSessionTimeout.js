import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../common/Toast';

const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes

export const useSessionTimeout = (logout, isAuthenticated, userRole) => {
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (isAuthenticated()) {
        showToast.warning('Session expired due to inactivity. Please log in again.');
        // Perform logout, then force a full reload to /login
        logout().finally(() => {
          window.location.replace('/login');
        });
      }
    }, INACTIVITY_LIMIT);
  };

  useEffect(() => {
    if (!isAuthenticated()) return;

    resetTimer();

    const handleActivity = () => resetTimer();
    events.forEach(event => window.addEventListener(event, handleActivity));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(event => window.removeEventListener(event, handleActivity));
    };
  }, [isAuthenticated, userRole]);
};
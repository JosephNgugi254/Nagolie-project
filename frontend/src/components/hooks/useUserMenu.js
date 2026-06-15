import { useState, useEffect } from 'react';
import api from '../../services/api';

export const useUserMenu = () => {
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        const response = await api.get('/auth/menu');
        setMenuItems(response.data);
      } catch (error) {
        console.error('Failed to fetch user menu:', error);
        // Fallback: use empty menu, but show error
        setMenuItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMenu();
  }, []);

  return { menuItems, loading };
};
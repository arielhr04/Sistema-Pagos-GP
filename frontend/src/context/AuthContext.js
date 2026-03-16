import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { clearApiCache } from '../lib/apiCache';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    clearApiCache();
    setToken(null);
    setUser(null);
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback((accessToken) => {
    // Decodificar exp del JWT para programar refresh 1 min antes de expirar
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      const expiresAt = payload.exp * 1000; // ms
      const refreshIn = expiresAt - Date.now() - 60_000; // 1 min antes
      if (refreshIn > 0) {
        refreshTimerRef.current = setTimeout(async () => {
          const refreshToken = localStorage.getItem('refresh_token');
          if (!refreshToken) { logout(); return; }
          try {
            const res = await axios.post(`${API_URL}/api/auth/refresh`, {
              refresh_token: refreshToken,
            });
            const { access_token, refresh_token: newRefresh } = res.data;
            localStorage.setItem('token', access_token);
            localStorage.setItem('refresh_token', newRefresh);
            setToken(access_token);
            scheduleRefresh(access_token);
          } catch {
            logout();
          }
        }, refreshIn);
      }
    } catch {
      // Token malformado, no programar refresh
    }
  }, [logout]);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const response = await axios.get(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(response.data);
          scheduleRefresh(token);
        } catch (error) {
          // Access token expirado → intentar refresh
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            try {
              const res = await axios.post(`${API_URL}/api/auth/refresh`, {
                refresh_token: refreshToken,
              });
              const { access_token, refresh_token: newRefresh } = res.data;
              localStorage.setItem('token', access_token);
              localStorage.setItem('refresh_token', newRefresh);
              setToken(access_token);

              const meRes = await axios.get(`${API_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${access_token}` }
              });
              setUser(meRes.data);
              scheduleRefresh(access_token);
            } catch {
              logout();
            }
          } else {
            logout();
          }
        }
      }
      setLoading(false);
    };
    initAuth();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [token, scheduleRefresh, logout]);

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      email,
      password
    });
    const { access_token, refresh_token, user: userData } = response.data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    setToken(access_token);
    setUser(userData);
    scheduleRefresh(access_token);
    return userData;
  };

  const getAuthHeader = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, getAuthHeader }}>
      {children}
    </AuthContext.Provider>
  );
};

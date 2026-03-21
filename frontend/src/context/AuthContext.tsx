import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';

const AuthContext = createContext(null);

// @ts-ignore
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('synapse_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      authAPI
        .getProfile()
        .then((res) => {
          setUser(res.data.user);
        })
        .catch((err) => {
          // Only logout if the server explicitly rejected the token (401)
          // Network errors or server downtime should not clear the session
          if (err?.message?.includes('Authentication') || err?.message?.includes('token')) {
            logout();
          } else {
            // Server might be down — keep the cached user so we don't force logout
            const cached = localStorage.getItem('synapse_user');
            if (cached) {
              try { setUser(JSON.parse(cached)); } catch { /* ignore */ }
            }
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  // Connect/disconnect socket when user changes
  useEffect(() => {
    if (user && (user as any)._id) {
      connectSocket((user as any)._id);
    } else {
      disconnectSocket();
    }
    return () => { disconnectSocket(); };
  }, [user && (user as any)?._id]);

  // @ts-ignore
  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    // OTP flow — return pending state, don't set token yet
    if (res.data?.requiresOTP) {
      return { requiresOTP: true, userId: res.data.userId, email: res.data.email };
    }
    const { user: userData, token: authToken } = res.data;
    localStorage.setItem('synapse_token', authToken);
    localStorage.setItem('synapse_user', JSON.stringify(userData));
    setToken(authToken);
    setUser(userData);
    return userData;
  };

  // @ts-ignore
  const register = async (name, email, password) => {
    const res = await authAPI.register({ name, email, password });
    // OTP flow — return pending state, don't set token yet
    if (res.data?.requiresOTP) {
      return { requiresOTP: true, userId: res.data.userId, email: res.data.email };
    }
    const { user: userData, token: authToken } = res.data;
    localStorage.setItem('synapse_token', authToken);
    localStorage.setItem('synapse_user', JSON.stringify(userData));
    setToken(authToken);
    setUser(userData);
    return userData;
  };

  const verifyOtp = async (userId: string, otp: string) => {
    const res = await authAPI.verifyOtp({ userId, otp });
    const { user: userData, token: authToken } = res.data;
    localStorage.setItem('synapse_token', authToken);
    localStorage.setItem('synapse_user', JSON.stringify(userData));
    setToken(authToken);
    setUser(userData);
    return userData;
  };

  const resendOtp = async (userId: string) => {
    await authAPI.resendOtp({ userId });
  };

  const logout = () => {
    localStorage.removeItem('synapse_token');
    localStorage.removeItem('synapse_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, verifyOtp, resendOtp, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

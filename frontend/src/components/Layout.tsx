import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationAPI } from '../services/api';
import { onNotification, NotificationEvent } from '../services/socket';
import {
  LayoutDashboard, MessageSquare, Search,
  LogOut, Brain, GraduationCap, FileText, Settings, Bell, Radio
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/workspace', label: 'Workspace', icon: Brain },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/channels', label: 'Channels', icon: Radio },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/quiz', label: 'Quiz', icon: GraduationCap },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // ── Notification state ──
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Load notifications on mount
  useEffect(() => {
    notificationAPI.list({ limit: 10 })
      .then((res: any) => {
        setNotifications(res.data || []);
        setUnreadCount(res.unreadCount || 0);
      })
      .catch(() => {});
  }, []);

  // Real-time notification listener
  useEffect(() => {
    const cleanup = onNotification((notif: NotificationEvent) => {
      setNotifications(prev => [notif, ...prev].slice(0, 20));
      setUnreadCount(prev => prev + 1);
    });
    return cleanup;
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await notificationAPI.markAllRead();
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* ignore */ }
  };

  const handleNotifClick = async (notif: any) => {
    if (!notif.read) {
      await notificationAPI.markRead(notif._id).catch(() => {});
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n._id === notif._id ? { ...n, read: true } : n));
    }
    // Navigate based on notification type
    if (notif.metadata?.channelId) {
      // Route to specific tab based on notification type
      const channelPath = `/channels/${notif.metadata.channelId}`;
      if (notif.type === 'channel_join_request') {
        navigate(`${channelPath}?tab=members`);
      } else {
        navigate(channelPath);
      }
      setShowNotifDropdown(false);
    } else if (notif.metadata?.conversationId) {
      navigate(`/chat/${notif.metadata.conversationId}`);
      setShowNotifDropdown(false);
    } else if (notif.metadata?.documentId) {
      navigate(`/documents/${notif.metadata.documentId}`);
      setShowNotifDropdown(false);
    } else if (notif.metadata?.workspaceId) {
      navigate(`/workspace/${notif.metadata.workspaceId}`);
      setShowNotifDropdown(false);
    }
  };

  const pageTitles: Record<string, string> = {
    '/': 'Dashboard',
    '/workspace': 'Workspace',
    '/documents': 'Document Store',
    '/chat': 'AI Chat',
    '/search': 'Semantic Search',
    '/quiz': 'Quiz',
    '/quiz/history': 'Quiz',
    '/channels': 'Channels',
    '/settings': 'Settings',
  };

  // Pages that manage their own scrolling and need no padding/overflow from app-content
  const isFullBleed = location.pathname.startsWith('/chat') || location.pathname.startsWith('/documents/') || /^\/workspace\/[a-f0-9]+/.test(location.pathname) || /^\/channels\/[a-f0-9]+/.test(location.pathname);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Brain size={20} />
          </div>
          <span className="sidebar-logo-text">Synapse AI</span>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Main Menu</span>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <item.icon className="sidebar-nav-icon" size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.name || 'User'}</div>
              <div className="sidebar-user-email">{user?.email || ''}</div>
            </div>
            <button onClick={logout} title="Sign out" className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30, flexShrink: 0 }}>
              <LogOut size={16} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        <header className="app-header">
          <div className="header-left">
            <h1 className="header-title">
              {pageTitles[location.pathname] || 'Synapse AI'}
            </h1>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Notification Bell */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                style={{ position: 'relative', width: 36, height: 36 }}
                onClick={() => setShowNotifDropdown(prev => !prev)}
                title="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 2, right: 2,
                    background: '#ef4444', color: '#fff',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700,
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 8,
                  width: 340, maxHeight: 400, overflowY: 'auto',
                  background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border-color, #333)',
                  borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 1000,
                }}>
                  <div style={{
                    padding: '12px 16px', borderBottom: '1px solid var(--border-color, #333)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="btn btn-ghost btn-sm" style={{ fontSize: 12, padding: '4px 8px' }}>
                        Mark all read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n._id}
                        onClick={() => handleNotifClick(n)}
                        style={{
                          padding: '10px 16px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border-color, #222)',
                          background: n.read ? 'transparent' : 'rgba(99, 102, 241, 0.08)',
                          transition: 'background 0.15s',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          borderLeft: n.read ? '3px solid transparent' : '3px solid var(--accent-primary, #6366f1)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                        onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(99, 102, 241, 0.08)')}
                      >
                        {!n.read && (
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-primary, #6366f1)', flexShrink: 0, marginTop: 4 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: n.read ? 400 : 700, fontSize: 13, color: n.read ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{n.title}</div>
                          {n.message && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{n.message}</div>}
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                            {n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="badge badge-purple">
              <Brain size={12} style={{ marginRight: 4 }} /> AI Powered
            </div>
          </div>
        </header>

        <div className={`app-content${isFullBleed ? ' full-bleed' : ''}`}>
          <div className="page-enter">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

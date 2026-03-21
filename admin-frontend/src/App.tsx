import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RaidTracePage from './pages/RaidTracePage';
import LogsPage from './pages/LogsPage';
import LiveStreamPage from './pages/LiveStreamPage';
import HealthPage from './pages/HealthPage';
import AdminUsersPage from './pages/AdminUsersPage';

function App() {
  const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('admin_token'));

  useEffect(() => {
    const handler = () => setAuthenticated(!!localStorage.getItem('admin_token'));
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const onLogin = () => setAuthenticated(true);
  const onLogout = () => {
    localStorage.removeItem('admin_token');
    setAuthenticated(false);
  };

  if (!authenticated) return <LoginPage onLogin={onLogin} />;

  return (
    <BrowserRouter>
      <Layout onLogout={onLogout}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/raid" element={<RaidTracePage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/stream" element={<LiveStreamPage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/admins" element={<AdminUsersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;

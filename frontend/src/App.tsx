import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ChatPage from './pages/ChatPage';
import SearchPage from './pages/SearchPage';
import DocumentDetailPage from './pages/DocumentDetailPage';
import QuizPage from './pages/QuizPage';
import WorkspacePage from './pages/WorkspacePage';
import DocumentsPage from './pages/DocumentsPage';
import SettingsPage from './pages/SettingsPage';
import ChannelsPage from './pages/ChannelsPage';
import ChannelDetailPage from './pages/ChannelDetailPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="auth-page"><div className="spinner" style={{ width: 40, height: 40 }} /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1a1a2e',
            color: '#f0f0f5',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '10px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/workspace" element={<WorkspacePage />} />
                  <Route path="/workspace/:workspaceId" element={<WorkspacePage />} />
                  <Route path="/documents" element={<DocumentsPage />} />
                  <Route path="/documents/:id" element={<DocumentDetailPage />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/chat/:convId" element={<ChatPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/groups" element={<Navigate to="/workspace" replace />} />
                  <Route path="/groups/:groupId" element={<Navigate to="/workspace" replace />} />
                  <Route path="/insights" element={<Navigate to="/" replace />} />
                  <Route path="/quiz" element={<QuizPage />} />
                  <Route path="/quiz/history" element={<QuizPage />} />
                  <Route path="/quiz/:quizId" element={<QuizPage />} />
                  <Route path="/channels" element={<ChannelsPage />} />
                  <Route path="/channels/:channelId" element={<ChannelDetailPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { systemAPI, documentAPI, aiAPI, quizAPI } from '../services/api';
import {
  FileText, MessageSquare, Search, FolderOpen,
  GraduationCap, ArrowRight, AlertTriangle, BookOpen,
  Target, TrendingUp, Clock, Upload, HardDrive,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [quizStats, setQuizStats] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [storage, setStorage] = useState<{ used: number; limit: number; percentage: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [dashRes, docsRes, quizRes, recoRes, storageRes] = await Promise.all([
        systemAPI.dashboardStats(),
        documentAPI.getAll({}),
        quizAPI.history().catch(() => ({ data: [] })),
        aiAPI.recommendations({}).catch(() => ({ data: {} })),
        documentAPI.getStorage().catch(() => ({ data: null })),
      ]);
      setStats(dashRes.data);
      const docs = docsRes.data.documents || [];
      setDocuments(docs);
      setRecommendations(recoRes.data);
      if (storageRes.data) setStorage(storageRes.data);

      const quizzes = (quizRes as any).data || [];
      if (quizzes.length > 0) {
        const completed = quizzes.filter((q: any) => q.status === 'completed');
        const avgScore = completed.length > 0
          ? Math.round(completed.reduce((s: number, q: any) => s + (q.score || 0), 0) / completed.length) : 0;
        const pending = quizzes.filter((q: any) => q.status !== 'completed');
        setQuizStats({
          total: quizzes.length, completed: completed.length, avgScore,
          failedCount: completed.filter((q: any) => q.score < 70).length,
          recentFailed: completed.filter((q: any) => q.score < 70).slice(0, 3),
          pendingCount: pending.length, pendingQuizzes: pending.slice(0, 3),
        });
      }
    } catch { toast.error('Failed to load dashboard'); }
    finally { setLoading(false); }
  };

  if (loading) {
    return <div className="empty-state"><div className="spinner" style={{ width: 40, height: 40 }} /></div>;
  }

  const pdfCount = documents.filter(d => d.type === 'pdf').length;
  const textCount = documents.filter(d => d.type === 'text').length;
  const readyCount = documents.filter(d => d.status === 'ready').length;

  return (
    <div className="dash-root">
      {/* —— Quick Actions Row —— */}
      <div className="dash-actions">
        <button className="dash-action-btn purple" onClick={() => navigate('/documents')}>
          <Upload size={18} /> Upload Docs
        </button>
        <button className="dash-action-btn blue" onClick={() => navigate('/chat')}>
          <MessageSquare size={18} /> AI Chat
        </button>
        <button className="dash-action-btn teal" onClick={() => navigate('/search')}>
          <Search size={18} /> Search
        </button>
        <button className="dash-action-btn green" onClick={() => navigate('/groups')}>
          <FolderOpen size={18} /> Groups
        </button>
        <button className="dash-action-btn amber" onClick={() => navigate('/quiz/history')}>
          <GraduationCap size={18} /> Quiz
        </button>
      </div>

      {/* —— Stats Row —— */}
      <div className="dash-stats-row">
        <div className="dash-stat" onClick={() => navigate('/documents')}>
          <FileText size={20} className="dash-stat-ico purple" />
          <div className="dash-stat-num">{stats?.documents?.total || 0}</div>
          <div className="dash-stat-lbl">Documents</div>
        </div>
        <div className="dash-stat" onClick={() => navigate('/chat')}>
          <MessageSquare size={20} className="dash-stat-ico blue" />
          <div className="dash-stat-num">{stats?.quizzes?.total || 0}</div>
          <div className="dash-stat-lbl">AI Queries</div>
        </div>
        {quizStats ? (
          <>
            <div className="dash-stat" onClick={() => navigate('/quiz/history')}>
              <GraduationCap size={20} className="dash-stat-ico green" />
              <div className="dash-stat-num">{quizStats.completed}</div>
              <div className="dash-stat-lbl">Quizzes Done</div>
            </div>
            <div className="dash-stat">
              <Target size={20} className="dash-stat-ico amber" />
              <div className="dash-stat-num" style={{ color: quizStats.avgScore >= 70 ? '#10b981' : quizStats.avgScore >= 40 ? '#f59e0b' : '#ef4444' }}>
                {quizStats.avgScore}%
              </div>
              <div className="dash-stat-lbl">Avg Score</div>
            </div>
          </>
        ) : (
          <>
            <div className="dash-stat">
              <FileText size={20} className="dash-stat-ico green" />
              <div className="dash-stat-num">{pdfCount}</div>
              <div className="dash-stat-lbl">PDFs</div>
            </div>
            <div className="dash-stat">
              <FileText size={20} className="dash-stat-ico amber" />
              <div className="dash-stat-num">{readyCount}</div>
              <div className="dash-stat-lbl">Ready</div>
            </div>
          </>
        )}
      </div>

      {/* —— Storage Bar —— */}
      {storage && (
        <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <HardDrive size={16} style={{ color: storage.percentage >= 90 ? '#ef4444' : storage.percentage >= 70 ? '#f59e0b' : 'var(--accent-primary)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Storage</span>
            </div>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {(storage.used / (1024 * 1024)).toFixed(1)} MB / {(storage.limit / (1024 * 1024)).toFixed(0)} MB
            </span>
          </div>
          <div style={{ width: '100%', height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(storage.percentage, 100)}%`, height: '100%', borderRadius: 4,
              background: storage.percentage >= 90 ? '#ef4444' : storage.percentage >= 70 ? '#f59e0b' : 'var(--accent-primary)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          {storage.percentage >= 90 && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>
              Storage almost full! Delete unused documents to free up space.
            </p>
          )}
        </div>
      )}

      {/* —— Two-col body —— */}
      <div className="dash-body">
        {/* Left column */}
        <div className="dash-col">
          {/* Pending quizzes */}
          {quizStats && quizStats.pendingCount > 0 && (
            <div className="dash-card amber-accent">
              <div className="dash-card-hdr">
                <h3><Clock size={16} /> Pending Quizzes</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/quiz/history')}>
                  View All <ArrowRight size={14} />
                </button>
              </div>
              <div className="dash-pending-list">
                {quizStats.pendingQuizzes.map((q: any) => (
                  <button key={q._id} className="dash-pending-item" onClick={() => navigate(`/quiz/${q._id}`)}>
                    <GraduationCap size={15} />
                    <div className="dash-pending-info">
                      <span className="dash-pending-title">{q.title}</span>
                      <span className="dash-pending-meta">{q.totalQuestions} questions</span>
                    </div>
                    <span className="dash-pending-badge">Resume</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Learning Progress */}
          {quizStats && quizStats.completed > 0 && (
            <div className="dash-card">
              <div className="dash-card-hdr">
                <h3><TrendingUp size={16} /> Learning Progress</h3>
              </div>
              <div className="dash-progress-grid">
                <div className="dash-prog-item">
                  <div className="dash-prog-val">{quizStats.total}</div>
                  <div className="dash-prog-lbl">Total</div>
                </div>
                <div className="dash-prog-item">
                  <div className="dash-prog-val" style={{ color: '#10b981' }}>{quizStats.completed}</div>
                  <div className="dash-prog-lbl">Completed</div>
                </div>
                <div className="dash-prog-item">
                  <div className="dash-prog-val" style={{ color: quizStats.avgScore >= 70 ? '#10b981' : '#f59e0b' }}>{quizStats.avgScore}%</div>
                  <div className="dash-prog-lbl">Avg Score</div>
                </div>
                <div className="dash-prog-item">
                  <div className="dash-prog-val" style={{ color: quizStats.failedCount > 0 ? '#ef4444' : '#10b981' }}>{quizStats.failedCount}</div>
                  <div className="dash-prog-lbl">Below 70%</div>
                </div>
              </div>
              {quizStats.avgScore < 70 && quizStats.recentFailed.length > 0 && (
                <div className="dash-focus-box warn">
                  <Target size={14} /> <span>Focus areas:</span>
                  {quizStats.recentFailed.map((q: any) => (
                    <span key={q._id} className="badge" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 11 }}>
                      {q.title} — {q.score}%
                    </span>
                  ))}
                </div>
              )}
              {quizStats.avgScore >= 70 && (
                <div className="dash-focus-box ok">
                  <Target size={14} /> Great retention — keep it up!
                </div>
              )}
            </div>
          )}

          {/* Knowledge Gaps */}
          <div className="dash-card">
            <div className="dash-card-hdr">
              <h3><AlertTriangle size={16} /> Knowledge Gaps</h3>
            </div>
            <ul className="insight-list">
              {(recommendations?.missingKnowledge || [
                'Upload more documents for comprehensive analysis',
                'Consider adding industry reports for context',
              ]).map((item: string, i: number) => (
                <li key={i} className="insight-list-item">{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right column */}
        <div className="dash-col">
          {/* Recent Documents */}
          <div className="dash-card">
            <div className="dash-card-hdr">
              <h3><FileText size={16} /> Recent Documents</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/documents')}>
                View All <ArrowRight size={14} />
              </button>
            </div>
            {(() => {
              const recentDocs = stats?.recentDocuments?.length > 0
                ? stats.recentDocuments
                : documents.slice(0, 5);
              return recentDocs.length > 0 ? (
              <div className="dash-list">
                {recentDocs.map((doc: any) => (
                  <div key={doc._id} className="dash-list-row" onClick={() => navigate(`/documents/${doc._id}`)}>
                    <div className={`dash-list-dot ${doc.type}`} />
                    <span className="dash-list-title">{doc.title}</span>
                    <span className={`doc-status ${doc.status}`}>{doc.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-empty-hint">No documents yet — upload one to get started.</p>
            );
            })()}
            <div className="dash-doc-summary">
              <span>{pdfCount} PDF{pdfCount !== 1 ? 's' : ''}</span>
              <span className="dash-dot-sep" />
              <span>{textCount} Text</span>
              <span className="dash-dot-sep" />
              <span style={{ color: 'var(--success)' }}>{readyCount} Ready</span>
            </div>
          </div>

          {/* Recent Queries */}
          <div className="dash-card">
            <div className="dash-card-hdr">
              <h3><MessageSquare size={16} /> Recent Queries</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/chat')}>
                Chat <ArrowRight size={14} />
              </button>
            </div>
            {stats?.recentQueries?.length > 0 ? (
              <div className="dash-list">
                {stats.recentQueries.map((q: any) => (
                  <div key={q._id} className="dash-list-row" onClick={() => navigate(q.conversationId ? `/chat/${q.conversationId}` : '/chat')}>
                    <span className="dash-list-title">{q.query}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-empty-hint">No queries yet — try the AI Chat.</p>
            )}
          </div>

          {/* Document Overview */}
          <div className="dash-card">
            <div className="dash-card-hdr">
              <h3><BookOpen size={16} /> Library Overview</h3>
            </div>
            <div className="dash-overview-rows">
              <div className="dash-overview-row">
                <span>Total Documents</span><span className="fw600">{documents.length}</span>
              </div>
              <div className="dash-overview-row">
                <span>PDFs</span><span className="fw600">{pdfCount}</span>
              </div>
              <div className="dash-overview-row">
                <span>Text Files</span><span className="fw600">{textCount}</span>
              </div>
              <div className="dash-overview-row">
                <span>Ready</span><span className="fw600" style={{ color: 'var(--success)' }}>{readyCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

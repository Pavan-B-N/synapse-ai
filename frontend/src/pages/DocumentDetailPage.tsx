import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { documentAPI, aiAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { joinDocRoom, leaveDocRoom, onDocumentStatus } from '../services/socket';
import { 
  FileText, ChevronLeft, 
  Send, Loader2, Sparkles, Brain, GraduationCap,
  Mic, MicOff, Download, Copy, Volume2, VolumeX, Eye, X,
  Share2, Search, Users
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { markdownLinkComponents } from '../components/ExternalLinkRenderer';
import toast from 'react-hot-toast';

interface Message {
  query?: string;
  answer: string;
  recommendations?: string[];
  createdAt: string;
  isSummary?: boolean;
}

interface DocumentData {
  _id: string;
  title: string;
  summary?: string;
  tags?: string[];
  status: string;
  type: string;
  size: number;
  createdAt: string;
  chunkCount?: number;
  userId?: string;
  sharedWith?: string[];
}

interface SharedUser {
  _id: string;
  name: string;
  email: string;
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Speech-to-text
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Copy & TTS
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null);

  // Document viewer
  const [showViewer, setShowViewer] = useState(false);
  const [docContent, setDocContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Document sharing
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchSkip, setSearchSkip] = useState(0);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [sharing, setSharing] = useState(false);
  const [docHasSearched, setDocHasSearched] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);

  const isOwner = doc?.userId === user?._id;

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  // Real-time document status updates
  useEffect(() => {
    if (!id) return;
    joinDocRoom(id);
    const unsub = onDocumentStatus((data) => {
      if (data.documentId !== id) return;
      setDoc(prev => prev ? { ...prev, status: data.status || prev.status } : prev);
    });
    return () => { leaveDocRoom(id); unsub(); };
  }, [id]);

  // Cleanup TTS on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  const copyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const speakMessage = (text: string, idx: number) => {
    if (speakingMsgIdx === idx) { window.speechSynthesis.cancel(); setSpeakingMsgIdx(null); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`>\-|]/g, ''));
    const savedVoice = localStorage.getItem('synapse_tts_voice');
    const savedRate = localStorage.getItem('synapse_tts_rate');
    if (savedVoice) {
      const voice = window.speechSynthesis.getVoices().find(v => v.name === savedVoice);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = savedRate ? parseFloat(savedRate) : 1;
    utterance.onend = () => setSpeakingMsgIdx(null);
    utterance.onerror = () => setSpeakingMsgIdx(null);
    window.speechSynthesis.speak(utterance);
    setSpeakingMsgIdx(idx);
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [docRes, historyRes] = await Promise.all([
        documentAPI.getById(id!),
        aiAPI.historyById(id!)
      ]);
      
      const document = docRes.data.document;
      setDoc(document);

      // Load shared user info
      if (document.sharedWith && document.sharedWith.length > 0 && document.userId === user?._id) {
        try {
          const usersRes = await authAPI.batchUsers(document.sharedWith);
          setSharedUsers((usersRes as any).data?.users || []);
        } catch { /* ignore */ }
      }
      
      const savedHistory = historyRes.data.queries || [];
      const messages: Message[] = savedHistory.map((q: any) => ({
        query: q.query,
        answer: q.answer,
        recommendations: q.recommendations,
        createdAt: q.createdAt
      }));

      // Always show summary as the first message
      if (document.summary) {
        messages.unshift({
          answer: `## Document Summary\n\n${document.summary}`,
          createdAt: document.createdAt,
          isSummary: true
        });
      }

      setHistory(messages);
    } catch (err: any) {
      toast.error('Failed to load document details');
      navigate('/documents');
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const userQuery = query.trim();
    if (!userQuery || chatLoading || !id) return;

    setQuery('');
    setChatLoading(true);

    try {
      const res = await aiAPI.query({
        query: userQuery,
        documentId: id
      });

      setHistory(prev => [...prev, {
        query: userQuery,
        answer: res.data.answer,
        recommendations: res.data.recommendations,
        createdAt: new Date().toISOString()
      }]);
    } catch (err: any) {
      toast.error('Failed to get response');
    } finally {
      setChatLoading(false);
    }
  };

  const handleTagClick = (tag: string) => {
    setQuery(`Tell me more about "${tag}" in this document`);
  };

  const openDocViewer = async () => {
    setShowViewer(true);
    if (docContent !== null) return;
    // For PDFs, use iframe with blob URL; for text files, fetch as text
    if (doc?.type === 'pdf') {
      setContentLoading(true);
      try {
        const token = localStorage.getItem('synapse_token');
        const url = documentAPI.getDownloadUrl(id!);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to fetch');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setDocContent(blobUrl);
      } catch {
        setDocContent(null);
      } finally {
        setContentLoading(false);
      }
    } else {
      setContentLoading(true);
      try {
        const token = localStorage.getItem('synapse_token');
        const url = documentAPI.getDownloadUrl(id!);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed to fetch');
        const text = await res.text();
        setDocContent(text);
      } catch {
        setDocContent('Unable to load document content. The document may still be processing.');
      } finally {
        setContentLoading(false);
      }
    }
  };

  const closeViewer = () => {
    if (doc?.type === 'pdf' && docContent) {
      URL.revokeObjectURL(docContent);
      setDocContent(null);
    }
    setShowViewer(false);
  };

  // Speech-to-text using browser Web Speech API
  const toggleSpeechToText = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = query;
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + transcript;
          setQuery(finalTranscript);
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        setQuery(finalTranscript + (finalTranscript ? ' ' : '') + interim);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') toast.error('Speech recognition error: ' + event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Download markdown report of chat history
  const downloadMarkdownReport = () => {
    if (!doc || history.length === 0) return;
    let md = `# ${doc.title} — Chat Report\n\n`;
    md += `**Document Type:** ${doc.type.toUpperCase()} | **Size:** ${(doc.size / 1024).toFixed(0)} KB | **Chunks:** ${doc.chunkCount || 0}\n`;
    md += `**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
    history.forEach((msg) => {
      if (msg.isSummary) {
        md += msg.answer + '\n\n---\n\n';
      } else {
        if (msg.query) md += `### Q: ${msg.query}\n\n`;
        md += msg.answer + '\n\n---\n\n';
      }
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/[^a-zA-Z0-9]/g, '_')}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded!');
  };

  // Document sharing logic
  const docSearchUsers = async (skip = 0) => {
    if (!shareSearch.trim() || shareSearch.trim().length < 2) return;
    setSearchLoading(true);
    try {
      const res = await authAPI.searchUsers(shareSearch.trim(), 5, skip);
      const data = (res as any).data;
      if (skip === 0) { setSearchResults(data.users || []); } else { setSearchResults(prev => [...prev, ...(data.users || [])]); }
      setSearchTotal(data.total || 0);
      setSearchSkip(skip + (data.users?.length || 0));
      setDocHasSearched(true);
    } catch (err: any) { toast.error(err.message || 'Search failed'); }
    finally { setSearchLoading(false); }
  };

  const shareDocument = async () => {
    if (!id || !selectedUser) return;
    setSharing(true);
    try {
      await documentAPI.share(id, selectedUser._id);
      toast.success(`Shared with ${selectedUser.name}`);
      // Add to local shared users list
      setSharedUsers(prev => [...prev, { _id: selectedUser._id, name: selectedUser.name, email: selectedUser.email }]);
      // Update doc's sharedWith
      setDoc(prev => prev ? { ...prev, sharedWith: [...(prev.sharedWith || []), selectedUser._id] } : null);
      setSelectedUser(null); setShareSearch(''); setSearchResults([]); setDocHasSearched(false);
    } catch (err: any) { toast.error(err.message || 'Failed to share'); }
    finally { setSharing(false); }
  };

  const unshareDocument = async (targetUserId: string) => {
    if (!id) return;
    try {
      await documentAPI.unshare(id, targetUserId);
      setSharedUsers(prev => prev.filter(u => u._id !== targetUserId));
      setDoc(prev => prev ? { ...prev, sharedWith: (prev.sharedWith || []).filter(uid => uid !== targetUserId) } : null);
      toast.success('Removed sharing');
    } catch (err: any) { toast.error(err.message || 'Failed to remove sharing'); }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <div className="spinner-glow" />
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="page-container" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Horizontal Header */}
      <div className="doc-detail-header-v2">
        {/* Left: back + title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button className="back-btn" onClick={() => navigate('/documents')}>
            <ChevronLeft size={20} />
          </button>
          <span className={`type-badge ${doc.type}`}>{doc.type.toUpperCase()}</span>
          <h1 className="header-doc-title" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.title}
          </h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {new Date(doc.createdAt).toLocaleDateString()}
          </span>
        </div>
        {/* Right: status pill */}
        <div className="status-pill" style={{ marginLeft: 16, flexShrink: 0 }}>
          <div className={`status-dot ${doc.status}`} />
          <span>{doc.status}</span>
        </div>
      </div>

      <div className="doc-detail-content-v2">
        {/* Main Chat Area */}
        <div className="doc-chat-main">
          <div className="messages-scroll-area">
            <div className="chat-max-width">
              {history.map((msg, i) => (
                <div key={i} className={`msg-group ${msg.query ? 'has-query' : 'ai-only'}`}>
                  {msg.query && (
                    <div className="user-msg-row">
                      <div className="user-bubble">
                        {msg.query}
                      </div>
                    </div>
                  )}
                  <div className="ai-msg-row">
                    <div className="ai-avatar-v2">
                      <Sparkles size={14} />
                    </div>
                    <div className="ai-content-card">
                      {msg.isSummary && (
                         <div className="summary-indicator">
                            <Brain size={12} />
                            <span>AI Perspective</span>
                         </div>
                      )}
                      <div className="markdown-v2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownLinkComponents}>{msg.answer}</ReactMarkdown>
                      </div>
                      <div className="ws-msg-actions">
                        <button className="ws-msg-action-btn" onClick={() => copyMessage(msg.answer)} title="Copy">
                          <Copy size={13} /> Copy
                        </button>
                        <button className="ws-msg-action-btn" onClick={() => speakMessage(msg.answer, i)} title={speakingMsgIdx === i ? 'Stop' : 'Speak'}>
                          {speakingMsgIdx === i ? <><VolumeX size={13} /> Stop</> : <><Volume2 size={13} /> Speak</>}
                        </button>
                      </div>
                      
                      {msg.recommendations && msg.recommendations.length > 0 && !chatLoading && i === history.length - 1 && (
                        <div className="follow-ups-v2">
                          <p className="follow-up-hint">Suggested follow-ups:</p>
                          <div className="follow-up-grid">
                            {msg.recommendations.map((rec, j) => (
                              <button key={j} className="follow-up-item" onClick={() => setQuery(rec)}>
                                {rec}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {chatLoading && (
                <div className="msg-group has-query">
                  <div className="user-msg-row">
                    <div className="user-bubble">...</div>
                  </div>
                  <div className="ai-msg-row">
                    <div className="ai-avatar-v2">
                      <Loader2 size={14} className="animate-spin" />
                    </div>
                    <div className="ai-content-card typing">
                      <div className="typing-indicator">
                        <span /> <span /> <span />
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Fixed Bottom UI */}
          <div className="chat-bottom-v2">
            <div className="chat-bottom-inner">
              {/* Quick prompts above input */}
              <div className="tags-overlay">
                <div className="tags-scroll">
                  <span className="tags-label">Quick Prompts:</span>
                  {doc.tags && doc.tags.length > 0 ? (
                    doc.tags.map((tag, i) => (
                      <button key={i} className="tag-chip-v2" onClick={() => handleTagClick(tag)}>
                        #{tag}
                      </button>
                    ))
                  ) : (
                    <>
                      <button className="tag-chip-v2" onClick={() => setQuery('Summarize this document')}>Summarize</button>
                      <button className="tag-chip-v2" onClick={() => setQuery('What are the key points?')}>Key Points</button>
                      <button className="tag-chip-v2" onClick={() => setQuery('Explain the main topics')}>Main Topics</button>
                    </>
                  )}
                </div>
              </div>

              <form className="chat-form-v2" onSubmit={handleSend}>
                <div className="input-glass-wrapper">
                  <button
                    type="button"
                    onClick={toggleSpeechToText}
                    className="mic-btn-inline"
                    style={{
                      color: isListening ? '#ef4444' : 'var(--text-tertiary)',
                      background: isListening ? 'rgba(239,68,68,0.1)' : 'transparent',
                    }}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                  >
                    {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                  <textarea
                    className="premium-input"
                    placeholder="Ask anything about this document..."
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      const el = e.target;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={chatLoading}
                    rows={1}
                  />
                  <button 
                    type="submit" 
                    className="premium-send-btn" 
                    disabled={!query.trim() || chatLoading}
                  >
                    {chatLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Minimal Side Controls */}
        <aside className="doc-side-info">
          {/* Document Info Card */}
          <div className="sidebar-info-card">
            <div className="sidebar-stat-row">
              <div className="sidebar-stat">
                <span className="sidebar-stat-val">{doc.chunkCount || 0}</span>
                <span className="sidebar-stat-lbl">Chunks</span>
              </div>
              <div className="sidebar-stat-divider" />
              <div className="sidebar-stat">
                <span className="sidebar-stat-val">{(doc.size / 1024).toFixed(0)}</span>
                <span className="sidebar-stat-lbl">KB</span>
              </div>
              <div className="sidebar-stat-divider" />
              <div className="sidebar-stat">
                <span className="sidebar-stat-val">{doc.type.toUpperCase()}</span>
                <span className="sidebar-stat-lbl">Format</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="sidebar-actions">
            <button
              className="sidebar-action-btn quiz"
              onClick={openDocViewer}
            >
              <div className="sidebar-action-icon quiz"><Eye size={18} /></div>
              <div className="sidebar-action-text">
                <span className="sidebar-action-title">View Source</span>
                <span className="sidebar-action-desc">Read document content</span>
              </div>
            </button>
            <button
              className="sidebar-action-btn quiz"
              onClick={() => navigate(`/quiz?docs=${doc._id}`)}
            >
              <div className="sidebar-action-icon quiz"><GraduationCap size={18} /></div>
              <div className="sidebar-action-text">
                <span className="sidebar-action-title">Take a Quiz</span>
                <span className="sidebar-action-desc">Test your knowledge</span>
              </div>
            </button>
            <button
              className="sidebar-action-btn download"
              onClick={downloadMarkdownReport}
              disabled={history.length === 0}
            >
              <div className="sidebar-action-icon download"><Download size={18} /></div>
              <div className="sidebar-action-text">
                <span className="sidebar-action-title">Download Report</span>
                <span className="sidebar-action-desc">Export chat as Markdown</span>
              </div>
            </button>
            {isOwner && (
            <button
              className="sidebar-action-btn quiz"
              onClick={() => setShowShareModal(true)}
            >
              <div className="sidebar-action-icon quiz"><Share2 size={18} /></div>
              <div className="sidebar-action-text">
                <span className="sidebar-action-title">Share Document</span>
                <span className="sidebar-action-desc">
                  {sharedUsers.length > 0 ? `Shared with ${sharedUsers.length} user${sharedUsers.length > 1 ? 's' : ''}` : 'Share with other users'}
                </span>
              </div>
            </button>
            )}
          </div>
        </aside>
      </div>

      {/* Document viewer modal */}
      {showViewer && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeViewer(); }}>
          <div className="modal-content" style={{ maxWidth: 800, width: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{doc.title}</h3>
              <button onClick={() => closeViewer()} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface-2)', borderRadius: 10, padding: doc?.type === 'pdf' ? 0 : 20 }}>
              {contentLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Loader2 size={24} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : doc?.type === 'pdf' && docContent ? (
                <iframe
                  src={docContent}
                  title={doc.title}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: 10, minHeight: '60vh' }}
                />
              ) : (
                <div className="markdown-v2" style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--text-primary)' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownLinkComponents}>
                    {docContent || 'No content available'}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document share modal */}
      {showShareModal && isOwner && (
        <div className="modal-overlay" style={{ background: 'transparent', backdropFilter: 'none' }}>
          <div className="modal-content" style={{ maxWidth: 480, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                <Share2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                Share Document
              </h3>
              <button onClick={() => { setShowShareModal(false); setSelectedUser(null); setSearchResults([]); setShareSearch(''); }} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>

            {/* Current shared users */}
            {sharedUsers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Shared With</div>
                {sharedUsers.map((su) => (
                  <div key={su._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: '1px solid var(--border-color, #222)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)' }}>{(su.name || 'U')[0].toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block' }}>{su.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{su.email}</span>
                      </div>
                    </div>
                    <button onClick={() => unshareDocument(su._id)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Find User</div>

            {!selectedUser ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    type="text" placeholder="Search by name or email..."
                    value={shareSearch} onChange={e => setShareSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setSearchSkip(0); docSearchUsers(0); } }}
                    style={{ flex: 1, padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => { setSearchSkip(0); docSearchUsers(0); }}
                    disabled={searchLoading || !shareSearch.trim() || shareSearch.trim().length < 2}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', whiteSpace: 'nowrap' }}
                  >
                    {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Find User
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-1)' }}>
                    {searchResults.map((u: any) => {
                      const alreadyShared = (doc?.sharedWith || []).includes(u._id);
                      const isDocOwner = doc?.userId === u._id;
                      const disabled = alreadyShared || isDocOwner;
                      return (
                        <button key={u._id} onClick={() => !disabled && setSelectedUser(u)}
                          disabled={disabled}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                            width: '100%', border: 'none', background: 'transparent', cursor: disabled ? 'default' : 'pointer',
                            borderBottom: '1px solid var(--border)', transition: 'background 0.15s',
                            opacity: disabled ? 0.5 : 1,
                          }}
                          onMouseEnter={e => !disabled && (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)' }}>{(u.name || 'U')[0].toUpperCase()}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                          </div>
                          {isDocOwner ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Owner</span>
                          ) : alreadyShared ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Already shared</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>Select</span>
                          )}
                        </button>
                      );
                    })}
                    {searchResults.length < searchTotal && (
                      <button onClick={() => docSearchUsers(searchSkip)} disabled={searchLoading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', width: '100%', border: 'none', background: 'transparent', color: 'var(--accent-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {searchLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                        Load more ({searchTotal - searchResults.length} remaining)
                      </button>
                    )}
                  </div>
                )}
                {searchResults.length === 0 && !searchLoading && docHasSearched && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No users found</p>
                )}
              </>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                  background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 12,
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-primary)' }}>{(selectedUser.name || 'U')[0].toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedUser.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedUser.email}</div>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 26, height: 26 }}><X size={14} /></button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn" onClick={() => setSelectedUser(null)} style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Back</button>
                  <button className="btn btn-primary" onClick={shareDocument} disabled={sharing} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {sharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                    Share
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

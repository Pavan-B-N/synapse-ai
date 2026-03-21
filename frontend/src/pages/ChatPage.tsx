import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { markdownLinkComponents } from '../components/ExternalLinkRenderer';
import { aiAPI, authAPI } from '../services/api';
import { joinConversationRoom, leaveConversationRoom, onConversationMessage, onChatShared, onChatUnshared, ConversationMessageEvent } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import {
  Send, Brain, FileText, Sparkles, Loader2,
  Plus, MessageSquare, ChevronLeft, ChevronRight, Clock,
  Mic, MicOff, Copy, Volume2, VolumeX, Share2, Search, X, Users, Trash2
} from 'lucide-react';

import toast from 'react-hot-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  recommendations?: string[];
}

interface Conversation {
  _id: string;       // conversationId
  title: string;
  lastMessageAt: string;
  sharedWith?: string[];   // user IDs the conv is shared with (for owned)
}

const NEW_CONV_ID = '__new__';

export default function ChatPage() {
  const navigate = useNavigate();
  const { convId: urlConvId } = useParams<{ convId?: string }>();
  const { user } = useAuth() as any;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>(urlConvId || NEW_CONV_ID);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convLoading, setConvLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    'Summarize my most recent document',
    'What are the key themes across my documents?',
    'Find information about project planning',
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null);
  const [sharedConversations, setSharedConversations] = useState<Conversation[]>([]);

  // Sidebar limits
  const [sharedVisible, setSharedVisible] = useState(5);
  const [recentVisible, setRecentVisible] = useState(10);

  // Chat sharing
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchSkip, setSearchSkip] = useState(0);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [sharing, setSharing] = useState(false);
  const [chatHasSearched, setChatHasSearched] = useState(false);

  // Shared users info for current conversation
  const [sharedUserIds, setSharedUserIds] = useState<string[]>([]);
  const [sharedUserDetails, setSharedUserDetails] = useState<any[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentConvIdRef = useRef<string>(urlConvId || NEW_CONV_ID);
  const recognitionRef = useRef<any>(null);

  // Cleanup TTS on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  // Join/leave conversation rooms for real-time shared chat updates
  useEffect(() => {
    if (activeConvId && activeConvId !== NEW_CONV_ID) {
      joinConversationRoom(activeConvId);
      return () => { leaveConversationRoom(activeConvId); };
    }
  }, [activeConvId]);

  // Listen for real-time messages in shared conversations
  useEffect(() => {
    const cleanup = onConversationMessage((ev: ConversationMessageEvent) => {
      if (ev.conversationId !== currentConvIdRef.current) return;
      // Skip messages we sent ourselves (we already added them optimistically)
      if (ev.senderUserId === user?._id) return;
      setMessages(prev => {
        // Check if these messages already exist (avoid duplicates)
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg?.content === ev.answer) return prev;
        return [
          ...prev,
          { role: 'user', content: ev.query },
          { role: 'assistant', content: ev.answer, sources: ev.sources, recommendations: ev.recommendations },
        ];
      });
    });
    return cleanup;
  }, [user?._id]);

  // Refresh sidebar when a chat is shared with us in real-time
  useEffect(() => {
    const cleanup = onChatShared(() => {
      loadConversations();
    });
    return cleanup;
  }, []);

  // Refresh sidebar when chat access is revoked
  useEffect(() => {
    const cleanup = onChatUnshared(() => {
      loadConversations();
    });
    return cleanup;
  }, []);

  useEffect(() => {
    loadConversations();
    // Load conversation from URL on mount
    if (urlConvId) {
      loadConversationMessages(urlConvId);
    }
  }, []);

  // When URL convId changes (e.g. from notification click), load that conversation
  useEffect(() => {
    if (urlConvId && urlConvId !== currentConvIdRef.current) {
      setActiveConvId(urlConvId);
      currentConvIdRef.current = urlConvId;
      loadConversationMessages(urlConvId);
      loadConversations();
    }
  }, [urlConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      setConvLoading(true);
      const res = await (aiAPI as any).conversations();
      const data = res.data || {};
      // Support new { owned, shared } and old array format
      const ownedRaw = Array.isArray(data) ? data : (data.owned || []);
      const sharedRaw = Array.isArray(data) ? [] : (data.shared || []);
      const mapConv = (c: any) => ({ _id: c._id, title: c.title || 'Untitled Chat', lastMessageAt: c.lastMessageAt, sharedWith: c.sharedWith || [] });
      setConversations(ownedRaw.map(mapConv));
      setSharedConversations(sharedRaw.map(mapConv));
    } catch {
      // If conversations endpoint doesn't exist yet, just silently fail
    } finally {
      setConvLoading(false);
    }
  };

  const loadConversationMessages = async (convId: string) => {
    try {
      setMsgLoading(true);
      setSuggestions([]);
      const res = await (aiAPI as any).conversationHistory(convId);
      const queries = res.data?.queries || [];
      const msgs: Message[] = [];
      queries.forEach((q: any) => {
        msgs.push({ role: 'user', content: q.query });
        msgs.push({ role: 'assistant', content: q.answer, sources: q.sourceDocuments });
      });
      setMessages(msgs);
    } catch (err: any) {
      if (err.message?.includes('revoked') || err.message?.includes('permission')) {
        toast.error('Access to this conversation has been revoked');
        setMessages([{ role: 'assistant', content: '⚠️ Access to this conversation has been revoked. You no longer have permission to view it.' }]);
      } else {
        toast.error('Failed to load conversation');
      }
    } finally {
      setMsgLoading(false);
    }
  };

  const selectConversation = useCallback(async (convId: string) => {
    if (convId === activeConvId) return;
    setActiveConvId(convId);
    currentConvIdRef.current = convId;
    setSuggestions([]);

    // Update URL
    if (convId === NEW_CONV_ID) {
      navigate('/chat', { replace: true });
    } else {
      navigate(`/chat/${convId}`, { replace: true });
    }

    if (convId === NEW_CONV_ID) {
      setMessages([]);
      setSuggestions([
        'Summarize my most recent document',
        'What are the key themes across my documents?',
        'Find information about project planning',
      ]);
      return;
    }

    await loadConversationMessages(convId);
  }, [activeConvId]);

  const startNewChat = () => {
    selectConversation(NEW_CONV_ID);
    navigate('/chat', { replace: true });
    inputRef.current?.focus();
  };

  const sendMessage = async (text = input) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);
    setSuggestions([]);

    // For new chats, generate a fresh conversationId
    const isNew = currentConvIdRef.current === NEW_CONV_ID;
    const convId = isNew ? `${Date.now()}` : currentConvIdRef.current;

    try {
      const res = await aiAPI.query({
        query: trimmed,
        conversationId: convId,
        conversationTitle: trimmed.substring(0, 40) + (trimmed.length > 40 ? '…' : ''),
      });
      const { answer, sources, recommendations, conversationId: returnedConvId } = (res as any).data;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: answer,
        sources: sources || [],
        recommendations: recommendations || [],
      }]);

      const finalConvId = returnedConvId || convId;

      if (isNew) {
        currentConvIdRef.current = finalConvId;
        setActiveConvId(finalConvId);
        navigate(`/chat/${finalConvId}`, { replace: true });
        // Add to sidebar
        const newConv: Conversation = {
          _id: finalConvId,
          title: trimmed.substring(0, 40) + (trimmed.length > 40 ? '…' : ''),
          lastMessageAt: new Date().toISOString(),
        };
        setConversations(prev => [newConv, ...prev]);
      }

      if (recommendations?.length > 0) setSuggestions(recommendations);
    } catch (err: any) {
      toast.error(err.message || 'Failed to get response');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Sorry, I encountered an error. Please try again.',
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isNewChat = activeConvId === NEW_CONV_ID && messages.length === 0;

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

  const toggleSTT = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Speech recognition not supported'); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    let final = input;
    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) { final += (final ? ' ' : '') + ev.results[i][0].transcript; setInput(final); }
        else interim += ev.results[i][0].transcript;
      }
      if (interim) setInput(final + (final ? ' ' : '') + interim);
    };
    rec.onerror = (ev: any) => { if (ev.error !== 'aborted') toast.error('Speech error: ' + ev.error); setIsListening(false); };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec; rec.start(); setIsListening(true);
  };

  const chatSearchUsers = async (skip = 0) => {
    if (!shareSearch.trim() || shareSearch.trim().length < 2) return;
    setSearchLoading(true);
    try {
      const res = await authAPI.searchUsers(shareSearch.trim(), 5, skip);
      const data = (res as any).data;
      if (skip === 0) { setSearchResults(data.users || []); } else { setSearchResults(prev => [...prev, ...(data.users || [])]); }
      setSearchTotal(data.total || 0);
      setSearchSkip(skip + (data.users?.length || 0));
      setChatHasSearched(true);
    } catch (err: any) { toast.error(err.message || 'Search failed'); }
    finally { setSearchLoading(false); }
  };

  const shareConversation = async () => {
    if (!selectedUser || activeConvId === NEW_CONV_ID) return;
    setSharing(true);
    try {
      await aiAPI.shareConversation(activeConvId, selectedUser._id);
      toast.success(`Shared with ${selectedUser.name}`);
      setSelectedUser(null); setShareSearch(''); setSearchResults([]); setShowShareModal(false);
      loadConversations();
      loadSharedUsers(activeConvId);
    } catch (err: any) { toast.error(err.message || 'Failed to share'); }
    finally { setSharing(false); }
  };

  const loadSharedUsers = async (convId: string) => {
    try {
      const res = await (aiAPI as any).getSharedUsers(convId);
      const ids: string[] = (res as any).data?.sharedWith || [];
      setSharedUserIds(ids);
      if (ids.length > 0) {
        const usersRes = await authAPI.batchUsers(ids);
        setSharedUserDetails((usersRes as any).data?.users || []);
      } else {
        setSharedUserDetails([]);
      }
    } catch { setSharedUserIds([]); setSharedUserDetails([]); }
  };

  const unshareConversation = async (targetUserId: string) => {
    if (activeConvId === NEW_CONV_ID) return;
    try {
      await aiAPI.unshareConversation(activeConvId, targetUserId);
      toast.success('Removed sharing');
      loadSharedUsers(activeConvId);
      loadConversations();
    } catch (err: any) { toast.error(err.message || 'Failed to unshare'); }
  };

  const deleteConversation = async (convId: string) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await aiAPI.deleteConversation(convId);
      toast.success('Conversation deleted');
      setConversations(prev => prev.filter(c => c._id !== convId));
      if (activeConvId === convId) {
        setActiveConvId(NEW_CONV_ID);
        setMessages([]);
        navigate('/chat', { replace: true });
      }
    } catch (err: any) { toast.error(err.message || 'Failed to delete'); }
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#08080c' }}>

      {/* ── Sidebar ── */}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        {sidebarOpen && (
          <>
            <div className="sidebar-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="ai-icon-bg" style={{ width: 32, height: 32 }}>
                  <Brain size={16} />
                </div>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Synapse AI</span>
              </div>
              <button className="icon-btn" onClick={() => setSidebarOpen(false)} title="Collapse sidebar">
                <ChevronLeft size={16} />
              </button>
            </div>

            <button className="new-chat-btn" onClick={startNewChat}>
              <Plus size={16} />
              New Chat
            </button>

            <div className="conv-list-area">
              {convLoading ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-muted)', margin: '0 auto' }} />
                </div>
              ) : conversations.length === 0 && sharedConversations.length === 0 ? (
                <div className="conv-empty">
                  <MessageSquare size={28} />
                  <p>No conversations yet</p>
                  <span>Start a new chat below</span>
                </div>
              ) : (
                <>
                  {/* Shared with you — shown first */}
                  {sharedConversations.length > 0 && (
                    <>
                      <p className="conv-group-label">
                        <Users size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                        Shared with you
                        <span style={{ marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>{sharedConversations.length}</span>
                      </p>
                      {sharedConversations.slice(0, sharedVisible).map(conv => (
                        <button
                          key={conv._id}
                          className={`conv-item ${conv._id === activeConvId ? 'active' : ''}`}
                          onClick={() => selectConversation(conv._id)}
                        >
                          <Share2 size={14} className="conv-icon" style={{ color: 'var(--accent-primary)' }} />
                          <div className="conv-text">
                            <span className="conv-title">{conv.title}</span>
                            <span className="conv-time">
                              <Clock size={10} />
                              {new Date(conv.lastMessageAt).toLocaleDateString()}
                            </span>
                          </div>
                        </button>
                      ))}
                      {sharedConversations.length > sharedVisible && (
                        <button
                          onClick={() => setSharedVisible(prev => prev + 5)}
                          style={{ width: '100%', padding: '6px 12px', background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
                        >
                          Load more ({sharedConversations.length - sharedVisible} remaining)
                        </button>
                      )}
                    </>
                  )}

                  {/* Recent (owned) */}
                  {conversations.length > 0 && (
                    <>
                      <p className="conv-group-label" style={{ marginTop: sharedConversations.length > 0 ? 12 : 0 }}>Recent</p>
                      {conversations.slice(0, recentVisible).map(conv => {
                        const sharedCnt = conv.sharedWith?.length || 0;
                        return (
                          <div key={conv._id} style={{ position: 'relative' }} className="conv-item-wrapper">
                            <button
                              className={`conv-item ${conv._id === activeConvId ? 'active' : ''}`}
                              onClick={() => selectConversation(conv._id)}
                              style={{ paddingRight: 30 }}
                            >
                              <MessageSquare size={14} className="conv-icon" />
                              <div className="conv-text">
                                <span className="conv-title">{conv.title}</span>
                                <span className="conv-time">
                                  <Clock size={10} />
                                  {new Date(conv.lastMessageAt).toLocaleDateString()}
                                  {sharedCnt > 0 && (
                                    <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 6, background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                      <Share2 size={8} style={{ verticalAlign: -1, marginRight: 2 }} />
                                      Shared {sharedCnt}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </button>
                            <button
                              className="conv-delete-btn"
                              onClick={(e) => { e.stopPropagation(); deleteConversation(conv._id); }}
                              title="Delete conversation"
                              style={{
                                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', padding: 4, borderRadius: 4, opacity: 0, transition: 'opacity 0.15s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                      {conversations.length > recentVisible && (
                        <button
                          onClick={() => setRecentVisible(prev => prev + 10)}
                          style={{ width: '100%', padding: '6px 12px', background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
                        >
                          Load more ({conversations.length - recentVisible} remaining)
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!sidebarOpen && (
          <div className="sidebar-collapsed-actions">
            <button className="icon-btn" onClick={() => setSidebarOpen(true)} title="Open sidebar">
              <Brain size={18} />
            </button>
            <button className="icon-btn" onClick={startNewChat} title="New Chat">
              <Plus size={18} />
            </button>
          </div>
        )}
      </aside>

      {/* ── Main Chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Header */}
        <div className="chat-header-v2">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!sidebarOpen && (
              <button className="icon-btn" onClick={() => setSidebarOpen(true)}>
                <Brain size={18} />
              </button>
            )}
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {activeConvId === NEW_CONV_ID
                  ? 'New Conversation'
                  : conversations.find(c => c._id === activeConvId)?.title || sharedConversations.find(c => c._id === activeConvId)?.title || 'Synapse Assistant'}
              </h2>
            </div>
          </div>
          {activeConvId !== NEW_CONV_ID && !sharedConversations.some(c => c._id === activeConvId) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setShowShareModal(true); loadSharedUsers(activeConvId); }}
              title="Share chat"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}
            >
              <Share2 size={15} />
              <span style={{ fontSize: 12 }}>Share</span>
              {(() => {
                const conv = conversations.find(c => c._id === activeConvId);
                const cnt = conv?.sharedWith?.length || 0;
                return cnt > 0 ? (
                  <span style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent-primary)', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 600 }}>{cnt}</span>
                ) : null;
              })()}
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="chat-messages-scroll">
          <div className="chat-max-width" style={{ maxWidth: 780, margin: '0 auto', width: '100%' }}>

            {/* Welcome Screen */}
            {isNewChat && (
              <div className="chat-welcome">
                <div className="welcome-icon-ring">
                  <Sparkles size={28} />
                </div>
                <h1 className="welcome-title">How can I help you today?</h1>
                <p className="welcome-subtitle">
                  Ask me anything about your documents, generate reports, or explore your knowledge base.
                </p>
                <div className="welcome-suggestions">
                  {suggestions.map((s, i) => (
                    <button key={i} className="welcome-chip" onClick={() => sendMessage(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading conversation */}
            {msgLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '40vh' }}>
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
              </div>
            )}

            {/* Message stream */}
            {!msgLoading && messages.map((msg, i) => (
              <div key={i} className={`chat-msg-row ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="chat-msg-avatar">
                    <div className="ai-avatar-sm"><Sparkles size={12} /></div>
                  </div>
                )}
                <div className="chat-msg-body">
                  <div className={`chat-msg-bubble ${msg.role}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownLinkComponents}>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="ws-msg-actions">
                      <button className="ws-msg-action-btn" onClick={() => copyMessage(msg.content)} title="Copy">
                        <Copy size={13} /> Copy
                      </button>
                      <button className="ws-msg-action-btn" onClick={() => speakMessage(msg.content, i)} title={speakingMsgIdx === i ? 'Stop' : 'Speak'}>
                        {speakingMsgIdx === i ? <><VolumeX size={13} /> Stop</> : <><Volume2 size={13} /> Speak</>}
                      </button>
                    </div>
                  )}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="msg-sources">
                      {[...new Map(msg.sources.map((src: any) => [src.documentId || src.title, src])).values()].map((src: any, j: number) => (
                        <button
                          key={j}
                          className="source-tag clickable"
                          onClick={() => src.documentId && navigate(`/documents/${src.documentId}`)}
                          title={src.documentId ? 'View document' : src.title}
                        >
                          <FileText size={10} />
                          {src.title}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Suggestions after last AI message */}
                  {msg.role === 'assistant' && i === messages.length - 1 && !loading && suggestions.length > 0 && (
                    <div className="inline-suggestions">
                      {suggestions.map((s, j) => (
                        <button key={j} className="inline-chip" onClick={() => sendMessage(s)}>{s}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="chat-msg-row assistant">
                <div className="chat-msg-avatar">
                  <div className="ai-avatar-sm"><Loader2 size={12} className="animate-spin" /></div>
                </div>
                <div className="chat-msg-body">
                  <div className="chat-msg-bubble assistant">
                    <div className="typing-indicator"><span /><span /><span /></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="chat-input-section-v2">
          <div style={{ maxWidth: 780, margin: '0 auto', width: '100%' }}>
            <div className="premium-chat-box">
              <button onClick={toggleSTT} className="chat-voice-btn"
                style={{ color: isListening ? '#ef4444' : 'var(--text-tertiary)', background: isListening ? 'rgba(239,68,68,0.1)' : 'transparent' }}
                title={isListening ? 'Stop listening' : 'Voice input'}>
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <textarea
                ref={inputRef}
                className="chat-textarea"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  // Auto-resize
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask Synapse AI anything…"
                rows={1}
                disabled={loading}
              />
              <button
                className="send-circle-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                <Send size={17} />
              </button>
            </div>
            <p className="chat-footer-note">
              Synapse AI may make mistakes. Verify important information from source documents.
            </p>
          </div>
        </div>
      </div>

      {/* Chat share modal */}
      {showShareModal && activeConvId !== NEW_CONV_ID && (
        <div className="modal-overlay" style={{ background: 'transparent', backdropFilter: 'none' }}>
          <div className="modal-content" style={{ maxWidth: 480, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                <Share2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                Share Chat
              </h3>
              <button onClick={() => { setShowShareModal(false); setSelectedUser(null); setSearchResults([]); setShareSearch(''); }} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>

            {/* Current shared users */}
            {sharedUserDetails.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Shared With</div>
                {sharedUserDetails.map((u: any) => (
                  <div key={u._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 0', borderBottom: '1px solid var(--border-color, #222)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)' }}>{(u.name || 'U')[0]?.toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block' }}>{u.name}</span>
                        {u.email && <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{u.email}</span>}
                      </div>
                    </div>
                    <button onClick={() => unshareConversation(u._id)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }}>
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
                  <input type="text" placeholder="Search by name or email..."
                    value={shareSearch} onChange={e => setShareSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { setSearchSkip(0); chatSearchUsers(0); } }}
                    style={{ flex: 1, padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <button className="btn btn-primary"
                    onClick={() => { setSearchSkip(0); chatSearchUsers(0); }}
                    disabled={searchLoading || !shareSearch.trim() || shareSearch.trim().length < 2}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', whiteSpace: 'nowrap' }}>
                    {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Find User
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-1)' }}>
                    {searchResults.map((u: any) => (
                      <button key={u._id} onClick={() => setSelectedUser(u)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)' }}>{(u.name || 'U')[0].toUpperCase()}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>Select</span>
                      </button>
                    ))}
                    {searchResults.length < searchTotal && (
                      <button onClick={() => chatSearchUsers(searchSkip)} disabled={searchLoading}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', width: '100%', border: 'none', background: 'transparent', color: 'var(--accent-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        {searchLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                        Load more ({searchTotal - searchResults.length} remaining)
                      </button>
                    )}
                  </div>
                )}
                {searchResults.length === 0 && !searchLoading && chatHasSearched && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No users found</p>
                )}
              </>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 12 }}>
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
                  <button className="btn btn-primary" onClick={shareConversation} disabled={sharing} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

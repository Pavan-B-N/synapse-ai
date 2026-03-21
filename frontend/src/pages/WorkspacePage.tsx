import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { groupAPI, documentAPI, aiAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { onDocumentStatus, DocStatusEvent, joinWorkspaceRoom, leaveWorkspaceRoom, onWorkspaceMessage, WorkspaceMessageEvent, onWorkspaceShared, onWorkspaceRemoved, onWorkspaceTyping, WorkspaceTypingEvent, onWorkspaceDocuments, WorkspaceDocumentsEvent, onWorkspacePresence, WorkspacePresenceEvent, getSocket } from '../services/socket';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { markdownLinkComponents } from '../components/ExternalLinkRenderer';
import {
  Plus, FileText, Trash2, Send, Loader2, Upload,
  ArrowLeft, GraduationCap, Mic, MicOff, X,
  Sparkles, Download, Brain, BookOpen, FileSearch,
  FolderOpen, Clock, MessageSquare, Paperclip,
  MessageCircle, Volume2, VolumeX, Copy, Share2, Users, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ── Types ── */
interface WorkspaceDoc { _id: string; title: string; type: string; status?: string; size?: number }
interface ChatMsg { role: string; content: string; createdAt?: string; userName?: string; userId?: string }
interface WorkspaceMember { userId: string; userName?: string; userEmail?: string; role: string; addedAt?: string }
interface Workspace {
  _id: string;
  name: string;
  description: string;
  documents: WorkspaceDoc[];
  chatHistory: ChatMsg[];
  messageCount?: number;
  createdAt: string;
  isOwner?: boolean;
  userRole?: string;
  members?: WorkspaceMember[];
  memberCount?: number;
  visibility?: string;
}

const DOC_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  pdf: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' },
  text: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' },
  other: { bg: 'rgba(156, 163, 175, 0.12)', color: '#9ca3af' },
};
const getTypeStyle = (type: string) => DOC_TYPE_COLORS[type] || DOC_TYPE_COLORS.other;

export default function WorkspacePage() {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const { user } = useAuth() as any;
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── List view state ── */
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [wsSearch, setWsSearch] = useState('');

  /* ── Detail view state ── */
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* ── Chat state ── */
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);

  /* ── Right sidebar ── */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<{ file: File; status: 'pending' | 'uploading' | 'done' | 'error'; progress: number }[]>([]);
  const [showAttach, setShowAttach] = useState(false);
  const [allDocs, setAllDocs] = useState<WorkspaceDoc[]>([]);
  const [allDocsLoading, setAllDocsLoading] = useState(false);

  /* ── Report ── */
  const [generating, setGenerating] = useState(false);
  const [reportStatus, setReportStatus] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPrompt, setReportPrompt] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  /* ── TTS ── */
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null);

  /* ── Speech ── */
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  /* ── Sharing ── */
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [shareRole, setShareRole] = useState<'readonly' | 'viewer' | 'editor'>('viewer');
  const [sharing, setSharing] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchSkip, setSearchSkip] = useState(0);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [hasSearched, setHasSearched] = useState(false);

  /* ── Typing indicator ── */
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());

  /* ── Online users (presence) ── */
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; userName?: string }[]>([]);

  /* ══════════════════════════════════════
     Data loading
     ══════════════════════════════════════ */
  useEffect(() => { loadWorkspaces(); }, [workspaceId]);

  // Real-time refresh when someone shares a workspace with us
  useEffect(() => {
    const cleanupShared = onWorkspaceShared(() => {
      loadWorkspaces();
    });
    const cleanupRemoved = onWorkspaceRemoved((data) => {
      toast(`You were removed from "${data.name}"`, { icon: '🚫' });
      setWorkspaces(prev => prev.filter(w => w._id !== data.workspaceId));
      if (workspaceId === data.workspaceId) {
        navigate('/workspace', { replace: true });
      }
    });
    return () => { cleanupShared(); cleanupRemoved(); };
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) loadDetail(workspaceId);
    else { setWorkspace(null); }
  }, [workspaceId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [workspace?.chatHistory?.length]);

  // Real-time document status updates via WebSocket
  useEffect(() => {
    const cleanup = onDocumentStatus((ev: DocStatusEvent) => {
      setWorkspace(prev => {
        if (!prev) return prev;
        const updated = prev.documents.map(d =>
          d._id === ev.documentId ? { ...d, status: ev.status } : d
        );
        return { ...prev, documents: updated };
      });
    });
    return cleanup;
  }, []);

  // Real-time workspace document list updates
  useEffect(() => {
    const cleanup = onWorkspaceDocuments((ev: WorkspaceDocumentsEvent) => {
      if (ev.workspaceId !== workspaceId) return;
      setWorkspace(prev => {
        if (!prev) return prev;
        return { ...prev, documents: ev.documents };
      });
    });
    return cleanup;
  }, [workspaceId]);

  // Join/leave workspace rooms for real-time chat
  useEffect(() => {
    if (workspaceId) {
      joinWorkspaceRoom(workspaceId);
      return () => { leaveWorkspaceRoom(workspaceId); };
    }
  }, [workspaceId]);

  // On socket reconnect, re-fetch latest workspace state to catch missed events
  useEffect(() => {
    if (!workspaceId) return;
    const s = getSocket();
    const handleReconnect = () => {
      loadDetail(workspaceId);
    };
    s.on('connect', handleReconnect);
    return () => { s.off('connect', handleReconnect); };
  }, [workspaceId]);

  // Listen for other users typing/thinking
  useEffect(() => {
    const cleanup = onWorkspaceTyping((ev: WorkspaceTypingEvent) => {
      if (ev.workspaceId !== workspaceId) return;
      if (ev.userId === user?._id) return; // skip own typing
      setTypingUsers(prev => {
        const next = new Map(prev);
        if (ev.isTyping) {
          next.set(ev.userId, ev.userName);
        } else {
          next.delete(ev.userId);
        }
        return next;
      });
    });
    return cleanup;
  }, [workspaceId, user?._id]);

  // Online users presence tracking
  useEffect(() => {
    const cleanup = onWorkspacePresence((ev: WorkspacePresenceEvent) => {
      if (ev.workspaceId !== workspaceId) return;
      setOnlineUsers(ev.onlineUsers || []);
    });
    return cleanup;
  }, [workspaceId]);

  // Real-time workspace message listener
  useEffect(() => {
    const cleanup = onWorkspaceMessage((msg: WorkspaceMessageEvent) => {
      if (msg.workspaceId !== workspaceId) return;
      // Skip user messages from ourselves (we already added them optimistically)
      if (msg.role === 'user' && msg.userId === user?._id) return;
      setWorkspace(prev => {
        if (!prev) return prev;
        // Avoid duplicates (check if message already in chat)
        const exists = prev.chatHistory.some(
          (m: any) => m._id === msg._id
        );
        if (exists) return prev;
        // For AI messages from our own request, check if we already appended via API response
        if (msg.role === 'assistant') {
          const lastMsg = prev.chatHistory[prev.chatHistory.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg?.content === msg.content) return prev;
        }
        return {
          ...prev,
          chatHistory: [...prev.chatHistory, {
            _id: msg._id,
            role: msg.role,
            content: msg.content,
            createdAt: msg.createdAt,
            userName: msg.userName,
            userId: msg.userId,
          }],
        };
      });
    });
    return cleanup;
  }, [workspaceId, user?._id]);

  const loadWorkspaces = async () => {
    try {
      const res = await groupAPI.list();
      setWorkspaces((res as any).data || []);
    } catch { /* ignore */ }
    finally { setListLoading(false); }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await groupAPI.getById(id);
      setWorkspace((res as any).data);
    } catch {
      toast.error('Failed to load workspace');
      navigate('/workspace', { replace: true });
    } finally { setDetailLoading(false); }
  };

  /* ══════════════════════════════════════
     Workspace CRUD
     ══════════════════════════════════════ */
  const createWorkspace = async () => {
    if (!newName.trim()) { toast.error('Enter a workspace name'); return; }
    setCreating(true);
    try {
      const res = await groupAPI.create({ name: newName, description: newDesc, documentIds: [] });
      const ws = (res as any).data;
      toast.success('Workspace created!');
      setWorkspaces(prev => [ws, ...prev]);
      setShowCreate(false);
      setNewName(''); setNewDesc('');
      navigate(`/workspace/${ws._id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create workspace');
    } finally { setCreating(false); }
  };

  const deleteWorkspace = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setShowDeleteModal(id);
  };

  const confirmDeleteWorkspace = async () => {
    const id = showDeleteModal;
    if (!id) return;
    try {
      await groupAPI.delete(id);
      setWorkspaces(prev => prev.filter(w => w._id !== id));
      if (workspaceId === id) navigate('/workspace', { replace: true });
      toast.success('Workspace deleted');
    } catch { toast.error('Failed to delete'); }
    finally { setShowDeleteModal(null); }
  };

  /* ══════════════════════════════════════
     Document upload (inside workspace)
     ══════════════════════════════════════ */
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!workspace) return;

    // Build queue with per-file status
    const queue = acceptedFiles.map(f => ({ file: f, status: 'pending' as const, progress: 0 }));
    setUploadQueue(queue);
    setUploading(true);

    const MAX_CONCURRENT = 2;
    let idx = 0;

    const uploadOne = async (qIdx: number) => {
      const file = queue[qIdx].file;
      setUploadQueue(prev => prev.map((item, i) => i === qIdx ? { ...item, status: 'uploading' } : item));
      try {
        const res = await documentAPI.upload(file, (ev: any) => {
          const pct = Math.round((ev.loaded * 100) / ev.total);
          setUploadQueue(prev => prev.map((item, i) => i === qIdx ? { ...item, progress: pct } : item));
        });
        const newDoc = (res as any).data?.document;
        const isDuplicate = (res as any).data?.duplicate;

        if (newDoc) {
          if (workspace.documents.some(d => d._id === newDoc._id)) {
            toast(`"${file.name}" already in this workspace`, { icon: 'ℹ️' });
          } else {
            if (isDuplicate) {
              toast(`"${file.name}" attached from library`, { icon: '📎' });
            } else {
              toast.success(`${file.name} uploaded`);
            }
            await groupAPI.update(workspace._id, {
              documentIds: [...workspace.documents.map(d => d._id), newDoc._id],
            });
            loadDetail(workspace._id);
          }
        }
        setUploadQueue(prev => prev.map((item, i) => i === qIdx ? { ...item, status: 'done', progress: 100 } : item));
      } catch (err: any) {
        toast.error(`Upload failed: ${err.message}`);
        setUploadQueue(prev => prev.map((item, i) => i === qIdx ? { ...item, status: 'error' } : item));
      }
    };

    // Process queue with max concurrency
    const promises: Promise<void>[] = [];
    const next = async (): Promise<void> => {
      while (idx < queue.length) {
        const currentIdx = idx++;
        await uploadOne(currentIdx);
      }
    };
    for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
      promises.push(next());
    }
    await Promise.all(promises);

    setUploading(false);
    // Clear queue after a short delay
    setTimeout(() => setUploadQueue([]), 2000);
  }, [workspace]);

  const openAttachModal = async () => {
    setShowAttach(true);
    setAllDocsLoading(true);
    try {
      const res = await documentAPI.getAll({ limit: 100 });
      setAllDocs((res as any).data?.documents || []);
    } catch { toast.error('Failed to load documents'); }
    finally { setAllDocsLoading(false); }
  };

  const attachDoc = async (docId: string) => {
    if (!workspace) return;
    if (workspace.documents.some(d => d._id === docId)) {
      toast('Already in this workspace', { icon: 'ℹ️' }); return;
    }
    try {
      await groupAPI.update(workspace._id, {
        documentIds: [...workspace.documents.map(d => d._id), docId],
      });
      toast.success('Document attached');
      loadDetail(workspace._id);
    } catch { toast.error('Failed to attach'); }
  };

  const removeDocFromWorkspace = async (docId: string) => {
    if (!workspace) return;
    try {
      const remaining = workspace.documents.filter(d => d._id !== docId).map(d => d._id);
      await groupAPI.update(workspace._id, { documentIds: remaining });
      setWorkspace(prev => prev ? { ...prev, documents: prev.documents.filter(d => d._id !== docId) } : null);
      toast.success('Document removed');
    } catch { toast.error('Failed to remove document'); }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'text/markdown': ['.md'], 'text/csv': ['.csv'] },
    maxSize: 50 * 1024 * 1024,
    noClick: false,
  });

  /* ══════════════════════════════════════
     Chat
     ══════════════════════════════════════ */
  const sendMessage = async () => {
    if (!chatInput.trim() || !workspace) return;
    const msg = chatInput.trim();
    setChatInput(''); setSending(true);
    // Optimistically add user message
    setWorkspace(prev => prev ? { ...prev, chatHistory: [...(prev.chatHistory || []), { role: 'user', content: msg, userName: user?.name || 'You', userId: user?._id }] } : null);
    try {
      const res = await groupAPI.chat(workspace._id, { message: msg });
      // Don't replace chatHistory with API response — the real-time socket handles message delivery
      // Just ensure we don't miss the AI reply if socket was slow
      const aiReply = (res as any).data?.reply;
      if (aiReply) {
        setWorkspace(prev => {
          if (!prev) return prev;
          // Check if AI reply already arrived via socket
          const lastMsg = prev.chatHistory[prev.chatHistory.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg?.content === aiReply) return prev;
          return { ...prev, chatHistory: [...prev.chatHistory, { role: 'assistant', content: aiReply, userName: 'AI Assistant' }] };
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
      setWorkspace(prev => prev ? { ...prev, chatHistory: prev.chatHistory.slice(0, -1) } : null);
    } finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const sendChipMessage = async (msg: string) => {
    if (!workspace) return;
    setChatInput(''); setSending(true);
    setWorkspace(prev => prev ? { ...prev, chatHistory: [...(prev.chatHistory || []), { role: 'user', content: msg, userName: user?.name || 'You', userId: user?._id }] } : null);
    try {
      const res = await groupAPI.chat(workspace._id, { message: msg });
      const aiReply = (res as any).data?.reply;
      if (aiReply) {
        setWorkspace(prev => {
          if (!prev) return prev;
          const lastMsg = prev.chatHistory[prev.chatHistory.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg?.content === aiReply) return prev;
          return { ...prev, chatHistory: [...prev.chatHistory, { role: 'assistant', content: aiReply, userName: 'AI Assistant' }] };
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to send');
      setWorkspace(prev => prev ? { ...prev, chatHistory: prev.chatHistory.slice(0, -1) } : null);
    } finally { setSending(false); }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    const el = e.target; el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  /* ══════════════════════════════════════
     Report generation — sends to chat + auto-downloads
     ══════════════════════════════════════ */
  const generateCustomReport = async () => {
    if (!workspace || !reportPrompt.trim()) return;
    const prompt = reportPrompt.trim();
    setShowReportModal(false);
    setGenerating(true);
    setReportStatus('Analyzing documents...');
    setReportPrompt('');

    // Optimistically add user message
    const userMsg = `📄 Generate report: ${prompt}`;
    setWorkspace(prev => prev ? { ...prev, chatHistory: [...(prev.chatHistory || []), { role: 'user', content: userMsg }] } : null);

    try {
      setReportStatus('Generating report — this may take a moment...');
      const res = await aiAPI.generate({
        type: 'custom',
        prompt,
        documentIds: workspace.documents.map(d => d._id),
      });
      const content = (res as any).data?.content || (res as any).content || '';

      setReportStatus('Saving to workspace...');
      // Save the report as a chat exchange in the workspace
      const chatRes = await groupAPI.chat(workspace._id, { message: `[Report Request] ${prompt}\n\n---\n\n${content}` });
      const reportReply = (chatRes as any).data?.reply;
      if (reportReply) {
        setWorkspace(prev => {
          if (!prev) return prev;
          const lastMsg = prev.chatHistory[prev.chatHistory.length - 1];
          if (lastMsg?.role === 'assistant' && lastMsg?.content === reportReply) return prev;
          return { ...prev, chatHistory: [...prev.chatHistory, { role: 'assistant', content: reportReply, userName: 'AI Assistant' }] };
        });
      }

      setReportStatus('Downloading...');
      // Auto-download
      let md = `# ${workspace.name} — Report\n\n`;
      md += `**Documents:** ${workspace.documents.map(d => d.title).join(', ')}\n`;
      md += `**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
      md += content;
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${workspace.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.md`;
      a.click(); URL.revokeObjectURL(url);
      toast.success('Report generated, saved to chat & downloaded!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate report');
      // Remove optimistic user message
      setWorkspace(prev => prev ? { ...prev, chatHistory: prev.chatHistory.slice(0, -1) } : null);
    } finally { setGenerating(false); setReportStatus(''); }
  };

  const downloadChat = () => {
    if (!workspace) return;
    const chat = workspace.chatHistory || [];
    if (chat.length === 0) { toast('No chat to download', { icon: 'ℹ️' }); return; }
    let md = `# ${workspace.name} — Chat History\n\n`;
    md += `**Generated:** ${new Date().toLocaleString()}\n\n---\n\n`;
    chat.forEach(m => { md += m.role === 'user' ? `### You\n${m.content}\n\n` : `### AI\n${m.content}\n\n---\n\n`; });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${workspace.name.replace(/[^a-zA-Z0-9]/g, '_')}_chat.md`;
    a.click(); URL.revokeObjectURL(url);
    toast.success('Chat downloaded!');
  };

  /* ══════════════════════════════════════
     Copy & TTS for messages
     ══════════════════════════════════════ */
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

  // Cleanup TTS on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  /* ══════════════════════════════════════
     Speech-to-text
     ══════════════════════════════════════ */
  const toggleSTT = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error('Speech recognition not supported'); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    let final = chatInput;
    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) { final += (final ? ' ' : '') + ev.results[i][0].transcript; setChatInput(final); }
        else interim += ev.results[i][0].transcript;
      }
      if (interim) setChatInput(final + (final ? ' ' : '') + interim);
    };
    rec.onerror = (ev: any) => { if (ev.error !== 'aborted') toast.error('Speech error: ' + ev.error); setIsListening(false); };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec; rec.start(); setIsListening(true);
  };

  /* ══════════════════════════════════════
     Workspace sharing
     ══════════════════════════════════════ */
  const searchUsers = async (skip = 0) => {
    if (!shareSearch.trim() || shareSearch.trim().length < 2) return;
    setSearchLoading(true);
    try {
      const res = await authAPI.searchUsers(shareSearch.trim(), 5, skip);
      const data = (res as any).data;
      if (skip === 0) {
        setSearchResults(data.users || []);
      } else {
        setSearchResults(prev => [...prev, ...(data.users || [])]);
      }
      setSearchTotal(data.total || 0);
      setSearchSkip(skip + (data.users?.length || 0));
      setHasSearched(true);
    } catch (err: any) {
      toast.error(err.message || 'Search failed');
    } finally { setSearchLoading(false); }
  };

  const shareWorkspace = async () => {
    if (!workspace || !selectedUser) return;
    setSharing(true);
    try {
      await groupAPI.share(workspace._id, { targetUserId: selectedUser._id, role: shareRole, targetUserName: selectedUser.name, targetUserEmail: selectedUser.email });
      toast.success(`Shared with ${selectedUser.name} as ${shareRole}`);
      setSelectedUser(null);
      setShareSearch('');
      setSearchResults([]);
      setHasSearched(false);
      setShowShareModal(false);
      loadDetail(workspace._id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to share');
    } finally { setSharing(false); }
  };

  const removeMember = async (memberId: string) => {
    if (!workspace) return;
    try {
      await groupAPI.removeMember(workspace._id, memberId);
      toast.success('Member removed');
      loadDetail(workspace._id);
    } catch { toast.error('Failed to remove member'); }
  };

  const changeMemberRole = async (memberId: string, newRole: string) => {
    if (!workspace) return;
    try {
      await groupAPI.updateMemberRole(workspace._id, memberId, newRole);
      toast.success('Role updated');
      loadDetail(workspace._id);
    } catch { toast.error('Failed to update role'); }
  };

  /* ══════════════════════════════════════
     RENDER — Workspace Detail (NotebookLM-style)
     ══════════════════════════════════════ */
  if (workspaceId && workspace) {
    return (
      <div className="ws-layout">
        {/* ── Center: Chat ── */}
        <div className="ws-center">
          {/* Header */}
          <div className="ws-header">
            <button onClick={() => navigate('/workspace')} className="btn btn-ghost btn-icon btn-sm" style={{ width: 34, height: 34 }}>
              <ArrowLeft size={18} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="ws-title">{workspace.name}</h2>
              {workspace.description && <p className="ws-subtitle">{workspace.description}</p>}
              {workspace.isOwner === false && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 8, background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', fontWeight: 600 }}>
                  Shared with you · {workspace.userRole || 'viewer'}
                </span>
              )}
            </div>
            {/* Share button */}
            {workspace.isOwner !== false && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowShareModal(true)}
                title="Share workspace"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px' }}
              >
                <Share2 size={15} />
                <span style={{ fontSize: 12 }}>Share</span>
                {(workspace.memberCount || 0) > 1 && (
                  <span style={{
                    background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)',
                    borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 600,
                  }}>
                    {workspace.memberCount}
                  </span>
                )}
              </button>
            )}
            <button className="ws-sidebar-toggle" onClick={() => setSidebarOpen(prev => !prev)} title={sidebarOpen ? 'Hide sources' : 'Show sources'}>
              <FileText size={16} />
              <span>{workspace.documents.length}</span>
            </button>
          </div>

          {/* Report generating status bar */}
          {generating && (
            <div className="ws-report-banner" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
              <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Generating report...</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{reportStatus}</div>
              </div>
            </div>
          )}

          {/* Chat area */}
          <div className="ws-chat-area">
            {(!workspace.chatHistory || workspace.chatHistory.length === 0) && (
              <div className="ws-welcome">
                <div className="welcome-icon-ring" style={{ width: 64, height: 64 }}>
                  <Brain size={28} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 6px' }}>
                  Chat with your sources
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 400 }}>
                  {workspace.documents.length === 0
                    ? 'Upload documents using the panel on the right, then start chatting.'
                    : 'Ask questions about your documents, generate summaries, or explore insights.'}
                </p>
                {workspace.documents.length > 0 && (
                  <div className="ws-quick-actions">
                    <button className="welcome-chip" onClick={() => sendChipMessage('Summarize all documents in this workspace')}>
                      <BookOpen size={14} /> Summarize All Docs
                    </button>
                    <button className="welcome-chip" onClick={() => sendChipMessage('What are the key insights from these documents?')}>
                      <Sparkles size={14} /> Key Insights
                    </button>
                    <button className="welcome-chip" onClick={() => sendChipMessage('Compare and contrast the main themes across documents')}>
                      <FileSearch size={14} /> Compare Documents
                    </button>
                    <button className="welcome-chip" onClick={() => sendChipMessage('Create detailed notes and explanations from these documents')}>
                      <BookOpen size={14} /> Create Study Notes
                    </button>
                  </div>
                )}
              </div>
            )}

            {workspace.chatHistory?.map((msg, i) => (
              <div key={i} className={`ws-msg ${msg.role}`}>
                <div className={`ws-msg-bubble ${msg.role}`}>
                  {msg.role === 'assistant'
                    ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownLinkComponents}>{msg.content}</ReactMarkdown></div>
                    : msg.content}
                </div>
                {msg.role === 'user' && msg.userName && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right', paddingRight: 4 }}>
                    {msg.userId === user?._id ? 'You' : msg.userName}
                  </div>
                )}
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
              </div>
            ))}

            {sending && (
              <div className="ws-msg assistant">
                <div className="ws-msg-bubble assistant">
                  <div className="typing-indicator"><span /><span /><span /></div>
                </div>
              </div>
            )}

            {typingUsers.size > 0 && !sending && (
              <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} asking AI...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="ws-input-area">
            <div className="ws-input-row">
              <button onClick={toggleSTT} className="ws-voice-btn"
                style={{ color: isListening ? '#ef4444' : 'var(--text-tertiary)', background: isListening ? 'rgba(239,68,68,0.1)' : 'transparent' }}
                title={isListening ? 'Stop' : 'Voice input'}>
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <textarea
                ref={textareaRef} value={chatInput} onChange={autoResize} onKeyDown={handleKeyDown}
                placeholder={workspace.userRole === 'readonly' ? 'Readonly access — you cannot send messages' : workspace.documents.length === 0 ? 'Upload documents to start chatting...' : 'Ask about your documents...'}
                disabled={workspace.documents.length === 0 || workspace.userRole === 'readonly'}
                rows={1}
                className="ws-textarea"
              />
              <button onClick={sendMessage} disabled={!chatInput.trim() || sending || workspace.documents.length === 0 || workspace.userRole === 'readonly'}
                className="ws-send-btn">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Sidebar: Sources ── */}
        {sidebarOpen && (
          <aside className="ws-sidebar">
            <div className="ws-sb-header">
              <h3 className="ws-sb-title">Sources</h3>
              <span className="ws-sb-count">{workspace.documents.length}</span>
            </div>

            {/* Two add options - only for owner/editor */}
            {(workspace.userRole === 'owner' || workspace.userRole === 'editor') && (
            <div className="ws-add-options">
              <div {...getRootProps()} className={`ws-add-btn ${isDragActive ? 'active' : ''}`}>
                <input {...getInputProps()} />
                {uploading ? (
                  <div className="ws-upload-progress">
                    <Loader2 size={14} className="animate-spin" />
                    <span>{uploadQueue.filter(q => q.status === 'done').length}/{uploadQueue.length} files</span>
                  </div>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Upload from device</span>
                  </>
                )}
              </div>
              <button className="ws-add-btn" onClick={openAttachModal}>
                <Paperclip size={14} />
                <span>Attach from store</span>
              </button>
            </div>
            )}

            {/* Attach existing modal */}
            {showAttach && (
              <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAttach(false); }}>
                <div className="modal-content" style={{ maxWidth: 480, width: '90%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Attach Documents</h3>
                    <button onClick={() => setShowAttach(false)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                      <X size={16} />
                    </button>
                  </div>
                  {allDocsLoading ? (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                      <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  ) : allDocs.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>
                      No documents found. Upload files first.
                    </p>
                  ) : (
                    <div style={{ maxHeight: 360, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {allDocs.map(doc => {
                        const attached = workspace.documents.some(d => d._id === doc._id);
                        const ts = getTypeStyle(doc.type || 'other');
                        return (
                          <button key={doc._id}
                            className={`ws-attach-item ${attached ? 'attached' : ''}`}
                            onClick={() => !attached && attachDoc(doc._id)}
                            disabled={attached}
                          >
                            <div style={{ width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ts.bg, flexShrink: 0 }}>
                              <FileText size={13} style={{ color: ts.color }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.title || 'Document'}
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: ts.color }}>{doc.type || 'text'}</span>
                            </div>
                            <span style={{ fontSize: 11, color: attached ? 'var(--success)' : 'var(--accent-primary)', fontWeight: 600 }}>
                              {attached ? '✓ Added' : '+ Add'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Document list */}
            <div className="ws-doc-list">
              {workspace.documents.length === 0 ? (
                <div className="ws-doc-empty">
                  <FileText size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                  <p>No sources added yet</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Drop files above or click to upload</p>
                </div>
              ) : (
                workspace.documents.map(doc => {
                  const ts = getTypeStyle(doc.type || 'other');
                  const isProcessing = doc.status === 'processing';
                  return (
                    <div key={doc._id} className="ws-doc-item" onClick={() => navigate(`/documents/${doc._id}`)}>
                      <div className="ws-doc-icon" style={{ background: ts.bg }}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" style={{ color: ts.color }} /> : <FileText size={14} style={{ color: ts.color }} />}
                      </div>
                      <div className="ws-doc-info">
                        <span className="ws-doc-name">{doc.title || 'Document'}</span>
                        <span className="ws-doc-type" style={{ color: isProcessing ? 'var(--warning)' : ts.color }}>
                          {isProcessing ? 'Processing…' : (doc.type || 'text').toUpperCase()}
                        </span>
                      </div>
                      {(workspace.userRole === 'owner' || workspace.userRole === 'editor') && (
                      <button className="ws-doc-remove" onClick={(e) => { e.stopPropagation(); removeDocFromWorkspace(doc._id); }} title="Remove from workspace">
                        <X size={12} />
                      </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div className="ws-sb-actions">
              {/* Online users — horizontal scrollable */}
              {onlineUsers.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 4px #22c55e' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Online ({onlineUsers.length})</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'thin' }}>
                    {onlineUsers.map(u => {
                      const member = workspace.members?.find(m => m.userId === u.userId);
                      const name = member?.userName || u.userName || 'User';
                      const initial = name[0]?.toUpperCase() || 'U';
                      return (
                        <div key={u.userId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44, flexShrink: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', background: 'rgba(34,197,94,0.15)',
                            border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>{initial}</span>
                          </div>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, textAlign: 'center', maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.userId === user?._id ? 'You' : name.split(' ')[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button className="ws-action-btn" onClick={() => navigate(`/quiz?docs=${workspace.documents.map(d => d._id).join(',')}`)}
                disabled={workspace.documents.length === 0}>
                <GraduationCap size={16} /> Take Quiz
              </button>
              <button className="ws-action-btn" onClick={downloadChat}
                disabled={!workspace.chatHistory || workspace.chatHistory.length === 0}>
                <MessageCircle size={16} /> Download Chat
              </button>
              <button className="ws-action-btn" onClick={() => { setReportPrompt(''); setShowReportModal(true); }}
                disabled={workspace.documents.length === 0 || generating}>
                {generating ? (
                  <><Loader2 size={16} className="animate-spin" /> {reportStatus || 'Generating...'}</>
                ) : (
                  <><Download size={16} /> Generate Report</>
                )}
              </button>
              <button className="ws-action-btn" onClick={() => deleteWorkspace(workspace._id)}
                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)', display: workspace.isOwner === false ? 'none' : undefined }}>
                <Trash2 size={16} /> Delete Workspace
              </button>
            </div>
          </aside>
        )}

        {/* Report download modal */}
        {showReportModal && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}>
            <div className="modal-content" style={{ maxWidth: 520, width: '90%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Generate & Download Report</h3>
                <button onClick={() => setShowReportModal(false)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                  <X size={16} />
                </button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Choose a preset or type a custom prompt. The report will be generated as detailed notes (not a chat) and downloaded as Markdown.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'Brief Documentation Notes', prompt: 'Create brief documentation notes from these documents — well-structured explanations and key concepts' },
                  { label: 'Detailed Summary', prompt: 'Create a detailed summary covering all major topics and insights from these documents' },
                  { label: 'Study Guide', prompt: 'Create a comprehensive study guide with concept explanations, key terms, and review questions from these documents' },
                  { label: 'Executive Briefing', prompt: 'Write a concise executive briefing highlighting critical findings and action items from these documents' },
                ].map(p => (
                  <button key={p.label} className="gen-chip" onClick={() => setReportPrompt(p.prompt)}
                    style={reportPrompt === p.prompt ? { borderColor: 'var(--accent-primary)', background: 'rgba(124,58,237,0.08)', color: 'var(--text-primary)' } : {}}>
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                value={reportPrompt} onChange={e => setReportPrompt(e.target.value)}
                placeholder="Or type your own instructions for the report..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)',
                  borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
                  outline: 'none', marginBottom: 16,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" onClick={() => setShowReportModal(false)}
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
                <button className="btn btn-primary" onClick={generateCustomReport} disabled={generating || !reportPrompt.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Generate & Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete workspace modal */}
        {showDeleteModal && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(null); }}>
            <div className="modal-content" style={{ maxWidth: 420, width: '90%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Delete Workspace</h3>
                <button onClick={() => setShowDeleteModal(null)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                  <X size={16} />
                </button>
              </div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                Are you sure you want to delete this workspace?
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
                This will permanently remove the workspace and its chat history. Documents will remain in your Document Store.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn" onClick={() => setShowDeleteModal(null)}
                  style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
                <button className="btn" onClick={confirmDeleteWorkspace}
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share workspace modal */}
        {showShareModal && workspace && (
          <div className="modal-overlay" style={{ background: 'transparent', backdropFilter: 'none' }}>
            <div className="modal-content" style={{ maxWidth: 500, width: '90%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <Share2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                  Share Workspace
                </h3>
                <button onClick={() => { setShowShareModal(false); setSelectedUser(null); setSearchResults([]); setShareSearch(''); }} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                  <X size={16} />
                </button>
              </div>

              {/* Current members */}
              {workspace.members && workspace.members.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Members</div>
                  {workspace.members.map((m: WorkspaceMember) => (
                    <div key={m.userId} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0', borderBottom: '1px solid var(--border-color, #222)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-primary)' }}>{(m.userName || m.userId)[0]?.toUpperCase() || 'U'}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.userName || m.userId}</span>
                          {m.userEmail && <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>{m.userEmail}</span>}
                        </div>
                        <span style={{
                          fontSize: 11, padding: '1px 6px', borderRadius: 8,
                          background: m.role === 'owner' ? 'rgba(99,102,241,0.15)' : m.role === 'editor' ? 'rgba(34,197,94,0.12)' : m.role === 'viewer' ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.06)',
                          color: m.role === 'owner' ? 'var(--accent-primary)' : m.role === 'editor' ? '#22c55e' : m.role === 'viewer' ? '#3b82f6' : 'var(--text-secondary)',
                          fontWeight: 600,
                          cursor: m.role !== 'owner' && workspace.isOwner ? 'pointer' : 'default',
                        }}
                          title={m.role !== 'owner' && workspace.isOwner ? 'Click to cycle role: readonly → viewer → editor' : ''}
                          onClick={() => {
                            if (m.role !== 'owner' && workspace.isOwner) {
                              const nextRole = m.role === 'readonly' ? 'viewer' : m.role === 'viewer' ? 'editor' : 'readonly';
                              changeMemberRole(m.userId, nextRole);
                            }
                          }}
                        >{m.role}</span>
                      </div>
                      {m.role !== 'owner' && workspace.isOwner && (
                        <button onClick={() => removeMember(m.userId)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Find user section */}
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Find User</div>

              {!selectedUser ? (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <input
                      type="text" placeholder="Search by name or email..."
                      value={shareSearch} onChange={e => setShareSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { setSearchSkip(0); searchUsers(0); } }}
                      style={{ flex: 1, padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => { setSearchSkip(0); searchUsers(0); }}
                      disabled={searchLoading || !shareSearch.trim() || shareSearch.trim().length < 2}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', whiteSpace: 'nowrap' }}
                    >
                      {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      Find User
                    </button>
                  </div>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-1)' }}>
                      {searchResults.map((u: any) => {
                        const alreadyMember = (workspace.members || []).some((m: WorkspaceMember) => m.userId === u._id);
                        return (
                          <button
                            key={u._id}
                            onClick={() => !alreadyMember && setSelectedUser(u)}
                            disabled={alreadyMember}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                              width: '100%', border: 'none', background: 'transparent', cursor: alreadyMember ? 'default' : 'pointer',
                              borderBottom: '1px solid var(--border)', opacity: alreadyMember ? 0.5 : 1,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => !alreadyMember && (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-primary)' }}>
                                {(u.name || 'U')[0].toUpperCase()}
                              </span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                            </div>
                            {alreadyMember ? (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Already added</span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>Select</span>
                            )}
                          </button>
                        );
                      })}
                      {searchResults.length < searchTotal && (
                        <button
                          onClick={() => searchUsers(searchSkip)}
                          disabled={searchLoading}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            padding: '10px', width: '100%', border: 'none', background: 'transparent',
                            color: 'var(--accent-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          {searchLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                          Load more ({searchTotal - searchResults.length} remaining)
                        </button>
                      )}
                    </div>
                  )}
                  {searchResults.length === 0 && !searchLoading && hasSearched && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No users found</p>
                  )}
                </>
              ) : (
                /* Selected user ready to share */
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                    background: 'rgba(99,102,241,0.08)', borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)', marginBottom: 12,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {(selectedUser.name || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedUser.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedUser.email}</div>
                    </div>
                    <button onClick={() => setSelectedUser(null)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 26, height: 26 }}>
                      <X size={14} />
                    </button>
                  </div>
                  <select
                    value={shareRole} onChange={e => setShareRole(e.target.value as 'readonly' | 'viewer' | 'editor')}
                    style={{ width: '100%', marginBottom: 12, padding: '10px 14px', backgroundColor: '#0a0a0f', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none', colorScheme: 'dark' }}
                  >
                    <option value="readonly" style={{ backgroundColor: '#0a0a0f', color: 'var(--text-primary)' }}>Readonly — can only read files and chats</option>
                    <option value="viewer" style={{ backgroundColor: '#0a0a0f', color: 'var(--text-primary)' }}>Viewer — can read and ask follow-up questions</option>
                    <option value="editor" style={{ backgroundColor: '#0a0a0f', color: 'var(--text-primary)' }}>Editor — can add/remove documents</option>
                  </select>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn" onClick={() => setSelectedUser(null)}
                      style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Back</button>
                    <button className="btn btn-primary" onClick={shareWorkspace} disabled={sharing}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

  /* ══════════════════════════════════════
     RENDER — Loading detail
     ══════════════════════════════════════ */
  if (workspaceId && detailLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }

  /* ══════════════════════════════════════
     RENDER — Workspace List
     ══════════════════════════════════════ */
  const renderWsCard = (ws: Workspace) => (
    <div key={ws._id} className="ws-card" onClick={() => navigate(`/workspace/${ws._id}`)}>
      <div className="ws-card-header">
        <div className="ws-card-icon"><Brain size={18} /></div>
        {ws.isOwner === false ? (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e',
            fontWeight: 600, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <Users size={10} /> Shared · {ws.userRole || 'viewer'}
          </span>
        ) : ws.visibility === 'shared' ? (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-primary, #6366f1)',
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto',
          }}>
            <Users size={10} /> Shared
          </span>
        ) : null}
      </div>
      <h3 className="ws-card-name">{ws.name}</h3>
      {ws.description && <p className="ws-card-desc">{ws.description}</p>}
      {ws.documents && ws.documents.length > 0 && (
        <div className="ws-card-docs">
          {ws.documents.slice(0, 3).map(d => {
            const ts = getTypeStyle(d.type || 'other');
            return <span key={d._id} className="ws-card-doc-tag" style={{ background: ts.bg, color: ts.color }}>{d.title || (d.type || 'doc').toUpperCase()}</span>;
          })}
          {ws.documents.length > 3 && <span className="ws-card-doc-tag" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>+{ws.documents.length - 3}</span>}
        </div>
      )}
      <div className="ws-card-footer">
        <span><FileText size={12} /> {ws.documents?.length || 0} sources</span>
        <span><MessageSquare size={12} /> {ws.messageCount || 0} msgs</span>
        <span><Clock size={12} /> {new Date(ws.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Workspaces</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Create workspaces to organize sources, chat with AI, and generate insights.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> New Workspace
        </button>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={wsSearch} onChange={e => setWsSearch(e.target.value)}
          placeholder="Search workspaces..."
          style={{
            width: '100%', padding: '10px 14px 10px 38px', background: 'var(--surface-1)',
            border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)',
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="modal-content" style={{ maxWidth: 480, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>New Workspace</h3>
              <button onClick={() => setShowCreate(false)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Workspace name..."
                style={{ padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' }}
                onKeyDown={e => e.key === 'Enter' && createWorkspace()}
              />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)..."
                style={{ padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              You can add documents after creating the workspace.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowCreate(false)}
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button className="btn btn-primary" onClick={createWorkspace} disabled={creating || !newName.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {creating ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace cards */}
      {listLoading ? (
        <div className="empty-state"><div className="spinner" style={{ width: 40, height: 40 }} /></div>
      ) : workspaces.length === 0 && !showCreate ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Brain size={36} /></div>
          <h3 className="empty-state-title">No workspaces yet</h3>
          <p className="empty-state-desc">Create your first workspace to start uploading sources and chatting with AI.</p>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Create Workspace
          </button>
        </div>
      ) : (() => {
        const filteredWs = workspaces.filter(ws => ws.name.toLowerCase().includes(wsSearch.toLowerCase()) || (ws.description || '').toLowerCase().includes(wsSearch.toLowerCase()));
        const myWs = filteredWs.filter(ws => ws.isOwner !== false);
        const sharedWs = filteredWs.filter(ws => ws.isOwner === false);
        if (filteredWs.length === 0 && wsSearch) {
          return <div className="empty-state"><h3 className="empty-state-title">No matches</h3><p className="empty-state-desc">Try a different search term.</p></div>;
        }
        return (
          <>
            {myWs.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Brain size={14} style={{ color: 'var(--accent-primary)' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Workspaces</h3>
                  <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)', fontWeight: 600 }}>{myWs.length}</span>
                </div>
                <div className="ws-grid">
                  {myWs.map(ws => renderWsCard(ws))}
                </div>
              </div>
            )}
            {sharedWs.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Users size={14} style={{ color: '#22c55e' }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Shared Workspaces</h3>
                  <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>{sharedWs.length}</span>
                </div>
                <div className="ws-grid">
                  {sharedWs.map(ws => renderWsCard(ws))}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}

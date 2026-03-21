import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import axios from 'axios';
import { channelAPI, authAPI } from '../services/api';
import {
  joinChannelRoom, leaveChannelRoom,
  onChannelNewPost, onChannelPostDeleted, onChannelNewComment,
  onChannelPostLiked, onChannelJoinRequest, onChannelApproved,
  onChannelInvited, onChannelRemoved, onChannelRejected,
} from '../services/socket';
import {
  ArrowLeft, Plus, Users, Hash, ThumbsUp, ThumbsDown, MessageCircle,
  FileText, Play, Type, Loader2, X, Trash2, Send, UserPlus,
  Check, XCircle, ChevronDown, ChevronUp, Shield, Crown,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Post {
  _id: string;
  type: 'pdf' | 'youtube' | 'markdown';
  title: string;
  content: string;
  fileUrl: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  authorName: string;
  authorId: string;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  userLiked: boolean;
  userDisliked: boolean;
  comments: any[];
  createdAt: string;
}

interface Channel {
  _id: string;
  name: string;
  description: string;
  profileImage: string;
  adminId: string;
  members: any[];
  joinRequests: any[];
  tags: string[];
  categories: string[];
  memberCount: number;
  postCount: number;
  isAdmin: boolean;
  isOwner: boolean;
  isMember: boolean;
  hasPendingRequest: boolean;
  attachedWorkspaces: string[];
}

const API_BASE = 'http://localhost:5000';

export default function ChannelDetailPage() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get('tab') as 'posts' | 'members' | null;

  const [channel, setChannel] = useState<Channel | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  // Panel state - derived from URL param
  const panel = panelParam || 'posts';
  const setPanel = (p: 'posts' | 'members') => {
    setSearchParams({ tab: p }, { replace: true });
  };

  // Create post
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postType, setPostType] = useState<'pdf' | 'youtube' | 'markdown'>('markdown');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postYoutubeUrl, setPostYoutubeUrl] = useState('');
  const [postFile, setPostFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comments
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [allComments, setAllComments] = useState<Record<string, any[]>>({});

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState<any[]>([]);

  // PDF blob URLs (fetched with auth to avoid CSP/401 issues)
  const [pdfBlobUrls, setPdfBlobUrls] = useState<Record<string, string>>({});

  const fetchPdfBlob = useCallback(async (fileUrl: string, postId: string) => {
    try {
      const token = localStorage.getItem('synapse_token');
      const res = await axios.get(`${API_BASE}${fileUrl}`, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const url = URL.createObjectURL(res.data);
      setPdfBlobUrls(prev => ({ ...prev, [postId]: url }));
    } catch { /* ignore - user may not have access */ }
  }, []);

  // Fetch blob URLs for PDF posts
  useEffect(() => {
    posts.forEach(p => {
      if (p.type === 'pdf' && p.fileUrl && !pdfBlobUrls[p._id]) {
        fetchPdfBlob(p.fileUrl, p._id);
      }
    });
  }, [posts, pdfBlobUrls, fetchPdfBlob]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(pdfBlobUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [pdfBlobUrls]);

  const loadChannel = useCallback(async () => {
    try {
      const res = await channelAPI.getById(channelId!);
      setChannel((res as any).data);
    } catch { toast.error('Channel not found'); navigate('/channels'); }
  }, [channelId, navigate]);

  const loadPosts = useCallback(async (page: number) => {
    setPostsLoading(true);
    try {
      const res = await channelAPI.getPosts(channelId!, { page, limit: 10 });
      const data = (res as any).data || [];
      if (page === 1) setPosts(data);
      else setPosts(prev => [...prev, ...data]);
      setHasMorePosts(data.length === 10);
      setPostsPage(page);
    } catch { /* ignore - user may not be member */ }
    setPostsLoading(false);
    setLoading(false);
  }, [channelId]);

  useEffect(() => {
    if (channelId) {
      loadChannel();
      loadPosts(1);
      joinChannelRoom(channelId);
    }
    return () => { if (channelId) leaveChannelRoom(channelId); };
  }, [channelId, loadChannel, loadPosts]);

  // Real-time listeners
  useEffect(() => {
    const c1 = onChannelNewPost((ev) => {
      if (ev.channelId !== channelId) return;
      setPosts(prev => [ev.post, ...prev]);
    });
    const c2 = onChannelPostDeleted((ev) => {
      if (ev.channelId !== channelId) return;
      setPosts(prev => prev.filter(p => p._id !== ev.postId));
    });
    const c3 = onChannelNewComment((ev) => {
      if (ev.channelId !== channelId) return;
      setPosts(prev => prev.map(p =>
        p._id === ev.postId ? { ...p, commentCount: p.commentCount + 1 } : p
      ));
      setAllComments(prev => ({
        ...prev,
        [ev.postId]: [...(prev[ev.postId] || []), ev.comment],
      }));
    });
    const c4 = onChannelPostLiked((ev) => {
      if (ev.channelId !== channelId) return;
      setPosts(prev => prev.map(p =>
        p._id === ev.postId ? { ...p, likeCount: ev.likeCount, dislikeCount: ev.dislikeCount } : p
      ));
    });
    const c5 = onChannelJoinRequest(() => loadChannel());
    const c6 = onChannelApproved(() => loadChannel());
    const c7 = onChannelInvited(() => loadChannel());
    const c8 = onChannelRemoved((ev) => {
      if (ev.channelId === channelId) {
        toast.error(`You have been removed from "${ev.channelName}"`);
        navigate('/channels');
      }
    });
    const c9 = onChannelRejected((ev) => {
      if (ev.channelId === channelId) {
        toast.error(`Your join request for "${ev.channelName}" was rejected.`);
        setChannel((prev: any) => prev ? { ...prev, hasPendingRequest: false, isMember: false } : prev);
      }
    });
    return () => { c1(); c2(); c3(); c4(); c5(); c6(); c7(); c8(); c9(); };
  }, [channelId, loadChannel, navigate]);

  const loadComments = async (postId: string) => {
    try {
      const res = await channelAPI.getComments(channelId!, postId);
      setAllComments(prev => ({ ...prev, [postId]: (res as any).data || [] }));
    } catch { /* ignore */ }
  };

  const toggleComments = (postId: string) => {
    const next = new Set(expandedComments);
    if (next.has(postId)) {
      next.delete(postId);
    } else {
      next.add(postId);
      if (!allComments[postId]) loadComments(postId);
    }
    setExpandedComments(next);
  };

  const closeComments = (postId: string) => {
    const next = new Set(expandedComments);
    next.delete(postId);
    setExpandedComments(next);
  };

  const handleCreatePost = async () => {
    if (!postTitle.trim()) { toast.error('Title is required'); return; }
    setSubmitting(true);
    try {
      if (postType === 'pdf') {
        if (!postFile) { toast.error('Please select a PDF file'); setSubmitting(false); return; }
        const formData = new FormData();
        formData.append('type', 'pdf');
        formData.append('title', postTitle.trim());
        formData.append('content', postContent);
        formData.append('file', postFile);
        await channelAPI.createPost(channelId!, formData, true);
      } else {
        await channelAPI.createPost(channelId!, {
          type: postType,
          title: postTitle.trim(),
          content: postContent,
          youtubeUrl: postYoutubeUrl,
        });
      }
      toast.success('Post created!');
      setShowCreatePost(false);
      setPostTitle(''); setPostContent(''); setPostYoutubeUrl(''); setPostFile(null);
      loadPosts(1);
    } catch (err: any) {
      toast.error(err.message);
    }
    setSubmitting(false);
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await channelAPI.likePost(channelId!, postId);
      const d = (res as any).data;
      setPosts(prev => prev.map(p =>
        p._id === postId ? { ...p, likeCount: d.likeCount, dislikeCount: d.dislikeCount, userLiked: d.userLiked, userDisliked: d.userDisliked } : p
      ));
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDislike = async (postId: string) => {
    try {
      const res = await channelAPI.dislikePost(channelId!, postId);
      const d = (res as any).data;
      setPosts(prev => prev.map(p =>
        p._id === postId ? { ...p, likeCount: d.likeCount, dislikeCount: d.dislikeCount, userLiked: d.userLiked, userDisliked: d.userDisliked } : p
      ));
    } catch (err: any) { toast.error(err.message); }
  };

  const handleComment = async (postId: string) => {
    const text = commentText[postId]?.trim();
    if (!text) return;
    try {
      await channelAPI.addComment(channelId!, postId, text);
      setCommentText(prev => ({ ...prev, [postId]: '' }));
      // Load all comments for this post
      loadComments(postId);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleApprove = async (userId: string) => {
    try {
      await channelAPI.approve(channelId!, userId);
      toast.success('Request approved');
      loadChannel();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleReject = async (userId: string) => {
    try {
      await channelAPI.reject(channelId!, userId);
      toast.success('Request rejected');
      loadChannel();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleInvite = async (targetUser: any) => {
    try {
      await channelAPI.invite(channelId!, { targetUserId: targetUser._id, targetUserName: targetUser.name, targetUserEmail: targetUser.email });
      toast.success(`Invited ${targetUser.name}`);
      setInviteSearch(''); setInviteResults([]);
      loadChannel();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await channelAPI.removeMember(channelId!, userId);
      toast.success('Member removed');
      loadChannel();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await channelAPI.deletePost(channelId!, postId);
      toast.success('Post deleted');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleJoin = async () => {
    try {
      await channelAPI.join(channelId!);
      toast.success('Join request sent!');
      loadChannel();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleChangeRole = async (userId: string, role: string) => {
    try {
      await channelAPI.changeRole(channelId!, userId, role);
      toast.success(`Role changed to ${role}`);
      loadChannel();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteChannel = async () => {
    if (!window.confirm('Are you sure you want to delete this channel? This action cannot be undone.')) return;
    try {
      await channelAPI.delete(channelId!);
      toast.success('Channel deleted');
      navigate('/channels');
    } catch (err: any) { toast.error(err.message); }
  };

  // Invite search
  useEffect(() => {
    if (!inviteSearch.trim()) { setInviteResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await authAPI.searchUsers(inviteSearch.trim(), 10);
        const memberIds = new Set((channel?.members || []).map((m: any) => m.userId?.toString?.() || m.userId));
        setInviteResults(((res as any).data?.users || (res as any).data || []).filter((u: any) => !memberIds.has(u._id)));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteSearch, channel?.members]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} /></div>;
  }

  if (!channel) return null;

  return (
    <div className="channel-detail">
      {/* Header */}
      <div className="channel-detail-header">
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/channels')} style={{ marginRight: 12 }}>
          <ArrowLeft size={20} />
        </button>
        <div className="channel-avatar channel-avatar-lg" style={channel.profileImage ? { backgroundImage: `url(${channel.profileImage})`, backgroundSize: 'cover' } : {}}>
          {!channel.profileImage && (channel.name?.charAt(0)?.toUpperCase() || '#')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{channel.name}</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>{channel.description || 'No description'}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span><Users size={12} /> {channel.memberCount} members</span>
            <span><Hash size={12} /> {channel.postCount} posts</span>
            {channel.isOwner && <span className="badge" style={{ fontSize: 10, background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>Owner</span>}
            {channel.isAdmin && !channel.isOwner && <span className="badge badge-purple" style={{ fontSize: 10 }}>Admin</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!channel.isMember && !channel.hasPendingRequest && (
            <button className="btn btn-primary" onClick={handleJoin}><UserPlus size={16} /> Join</button>
          )}
          {channel.hasPendingRequest && !channel.isMember && (
            <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', padding: '6px 12px' }}>Request Pending</span>
          )}
          {channel.isAdmin && (
            <>
              <button className="btn btn-primary" onClick={() => setShowCreatePost(true)}><Plus size={16} /> New Post</button>
              <button className="btn btn-ghost" onClick={() => setShowInvite(true)}><UserPlus size={16} /> Invite</button>
            </>
          )}
          {channel.isOwner && (
            <button className="btn btn-ghost" onClick={handleDeleteChannel} title="Delete channel"
              style={{ color: 'var(--error)' }}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="channels-tabs" style={{ marginBottom: 0 }}>
        <button className={`channels-tab ${panel === 'posts' ? 'active' : ''}`} onClick={() => setPanel('posts')}>
          <Hash size={14} /> Posts
        </button>
        <button className={`channels-tab ${panel === 'members' ? 'active' : ''}`} onClick={() => setPanel('members')}>
          <Users size={14} /> Members ({channel.memberCount})
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="channel-detail-content">
        {/* Posts Panel */}
        {panel === 'posts' && (
        <div className="channel-posts">
          {!channel.isMember ? (
            <div className="channels-empty">
              <Hash size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
              <p style={{ color: 'var(--text-secondary)' }}>Join this channel to view posts</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="channels-empty">
              <Hash size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
              <p style={{ color: 'var(--text-secondary)' }}>No posts yet. {channel.isAdmin && 'Create the first post!'}</p>
            </div>
          ) : (
            <>
              {posts.map(post => (
                <div key={post._id} className="channel-post-card">
                  {/* Post header */}
                  <div className="channel-post-header">
                    <div className="channel-post-type-badge" data-type={post.type}>
                      {post.type === 'pdf' ? <FileText size={14} /> : post.type === 'youtube' ? <Play size={14} /> : <Type size={14} />}
                      {post.type}
                    </div>
                    <h3 className="channel-post-title">{post.title}</h3>
                    <div className="channel-post-meta">
                      <span>{post.authorName}</span>
                      <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                    </div>
                    {channel.isAdmin && (
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleDeletePost(post._id)} style={{ marginLeft: 'auto' }}>
                        <Trash2 size={14} style={{ color: 'var(--error)' }} />
                      </button>
                    )}
                  </div>

                  {/* Post content */}
                  <div className="channel-post-body">
                    {post.type === 'youtube' && post.youtubeVideoId && (
                      <div className="channel-youtube-embed">
                        <iframe
                          src={`https://www.youtube.com/embed/${post.youtubeVideoId}`}
                          title={post.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          style={{ border: 'none', width: '100%', height: '100%', borderRadius: 10 }}
                        />
                      </div>
                    )}
                    {post.type === 'pdf' && post.fileUrl && (
                      <div
                        className="channel-pdf-preview channel-pdf-thumbnail"
                        onClick={() => pdfBlobUrls[post._id] && window.open(pdfBlobUrls[post._id], '_blank')}
                        style={{ cursor: pdfBlobUrls[post._id] ? 'pointer' : 'default' }}
                        title="Click to view full PDF"
                      >
                        {pdfBlobUrls[post._id] ? (
                          <iframe
                            src={`${pdfBlobUrls[post._id]}#page=1&view=FitH`}
                            title={post.title}
                            className="channel-pdf-iframe-thumb"
                            tabIndex={-1}
                          />
                        ) : (
                          <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', borderRadius: 10 }}>
                            <Loader2 size={24} className="spin" style={{ color: 'var(--accent-primary)' }} />
                          </div>
                        )}
                        <div className="channel-pdf-thumb-overlay">
                          <FileText size={18} />
                          <span>View PDF</span>
                        </div>
                      </div>
                    )}
                    {post.type === 'markdown' && post.content && (
                      <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.6 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {post.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {post.content && post.type !== 'markdown' && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 8 }}>{post.content}</p>
                    )}
                  </div>

                  {/* Actions bar */}
                  <div className="channel-post-actions">
                    <button className={`channel-action-btn ${post.userLiked ? 'active-like' : ''}`} onClick={() => handleLike(post._id)}>
                      <ThumbsUp size={15} /> {post.likeCount || 0}
                    </button>
                    <button className={`channel-action-btn ${post.userDisliked ? 'active-dislike' : ''}`} onClick={() => handleDislike(post._id)}>
                      <ThumbsDown size={15} /> {post.dislikeCount || 0}
                    </button>
                    <button className={`channel-action-btn ${expandedComments.has(post._id) ? 'active-comment' : ''}`} onClick={() => toggleComments(post._id)}>
                      <MessageCircle size={15} /> {post.commentCount || 0}
                    </button>
                  </div>

                  {/* Comments section */}
                  {expandedComments.has(post._id) && (
                    <div className="channel-comments">
                      {(allComments[post._id] || post.comments || []).map((c: any) => (
                        <div key={c._id} className="channel-comment">
                          <div className="channel-comment-avatar">{c.userName?.charAt(0)?.toUpperCase() || 'U'}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{c.userName}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 8 }}>
                              {new Date(c.createdAt).toLocaleString()}
                            </span>
                            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{c.content}</p>
                          </div>
                        </div>
                      ))}
                      <div className="channel-comment-input">
                        <input
                          className="form-input"
                          placeholder="Write a comment..."
                          value={commentText[post._id] || ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [post._id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') handleComment(post._id); }}
                          style={{ fontSize: 13 }}
                        />
                        <button className="btn btn-primary btn-sm btn-icon" onClick={() => handleComment(post._id)}>
                          <Send size={14} />
                        </button>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => closeComments(post._id)} style={{ alignSelf: 'center', marginTop: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
                        <ChevronUp size={14} /> Close Comments
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {hasMorePosts && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                  <button className="btn btn-ghost" onClick={() => loadPosts(postsPage + 1)} disabled={postsLoading}>
                    {postsLoading ? <Loader2 size={16} className="spin" /> : <ChevronDown size={16} />} Load more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Members Panel */}
      {panel === 'members' && (
        <div className="channel-members-panel">
          {/* Join requests (admin only) */}
          {channel.isAdmin && channel.joinRequests?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--warning)' }}>
                Pending Requests ({channel.joinRequests.length})
              </h4>
              {channel.joinRequests.map((r: any) => (
                <div key={r.userId} className="channel-member-row">
                  <div className="channel-comment-avatar">{r.userName?.charAt(0)?.toUpperCase() || 'U'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.userName || 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.userEmail}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => handleApprove(r.userId)} style={{ padding: '4px 10px' }}>
                    <Check size={14} /> Approve
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleReject(r.userId)} style={{ padding: '4px 10px', color: 'var(--error)' }}>
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Members ({channel.memberCount})</h4>
          {(channel.members || []).map((m: any) => (
            <div key={m.userId} className="channel-member-row">
              <div className="channel-comment-avatar">{m.userName?.charAt(0)?.toUpperCase() || 'U'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.userName || 'Unknown'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m.userEmail}</div>
              </div>
              <span className="badge" style={{
                fontSize: 10,
                background: m.role === 'owner' ? 'rgba(234,179,8,0.15)' : m.role === 'admin' ? 'var(--accent-subtle)' : 'var(--surface-2)',
                color: m.role === 'owner' ? '#eab308' : m.role === 'admin' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                {m.role === 'owner' ? <Crown size={10} /> : m.role === 'admin' ? <Shield size={10} /> : null}
                {m.role}
              </span>
              {/* Owner can change roles of non-owner members */}
              {channel.isOwner && m.role !== 'owner' && (
                <select
                  value={m.role}
                  onChange={(e) => handleChangeRole(m.userId, e.target.value)}
                  style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-secondary)', fontSize: 11, padding: '3px 6px', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              )}
              {channel.isAdmin && m.role === 'member' && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleRemoveMember(m.userId)}>
                  <X size={14} style={{ color: 'var(--error)' }} />
                </button>
              )}
              {channel.isOwner && m.role === 'admin' && (
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => handleRemoveMember(m.userId)}>
                  <X size={14} style={{ color: 'var(--error)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      </div>{/* End channel-detail-content */}

      {/* Create Post Modal - does NOT close on outside click */}
      {showCreatePost && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Create Post</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreatePost(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Post type selector */}
              <div>
                <label className="form-label">Post Type</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['markdown', 'youtube', 'pdf'] as const).map(t => (
                    <button key={t} className={`btn ${postType === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPostType(t)} style={{ flex: 1, textTransform: 'capitalize' }}>
                      {t === 'pdf' ? <FileText size={14} /> : t === 'youtube' ? <Play size={14} /> : <Type size={14} />}
                      {t === 'pdf' ? 'PDF Notes' : t === 'youtube' ? 'YouTube Video' : 'Markdown'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">Title *</label>
                <input className="form-input" placeholder="Post title" value={postTitle} onChange={e => setPostTitle(e.target.value)} maxLength={200} />
              </div>

              {postType === 'youtube' && (
                <div>
                  <label className="form-label">YouTube URL *</label>
                  <input className="form-input" placeholder="https://www.youtube.com/watch?v=..." value={postYoutubeUrl} onChange={e => setPostYoutubeUrl(e.target.value)} />
                </div>
              )}

              {postType === 'pdf' && (
                <div>
                  <label className="form-label">PDF File *</label>
                  <input ref={fileInputRef} type="file" accept=".pdf" onChange={e => setPostFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                  <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', justifyContent: 'center' }}>
                    <FileText size={16} /> {postFile ? postFile.name : 'Choose PDF file'}
                  </button>
                </div>
              )}

              <div>
                <label className="form-label">{postType === 'markdown' ? 'Content *' : 'Description (optional)'}</label>
                <textarea
                  className="form-input"
                  rows={postType === 'markdown' ? 10 : 3}
                  placeholder={postType === 'markdown' ? 'Write your study notes in Markdown...' : 'Brief description of this post'}
                  value={postContent}
                  onChange={e => setPostContent(e.target.value)}
                  style={{ fontFamily: postType === 'markdown' ? 'var(--font-mono)' : 'inherit', fontSize: 13 }}
                />
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--surface-1)', padding: '8px 12px', borderRadius: 8 }}>
                AI content moderation is enabled. Posts with sensitive, explicit, or non-educational content will be rejected.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreatePost(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreatePost} disabled={submitting}>
                {submitting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Invite Members</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setShowInvite(false); setInviteSearch(''); setInviteResults([]); }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <input className="form-input" placeholder="Search users by name or email..." value={inviteSearch} onChange={e => setInviteSearch(e.target.value)} autoFocus />
              <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                {inviteResults.length === 0 && inviteSearch.trim().length >= 2 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>No users found</div>
                )}
                {inviteResults.map((u: any) => (
                  <div key={u._id} className="channel-member-row" style={{ cursor: 'pointer' }} onClick={() => handleInvite(u)}>
                    <div className="channel-comment-avatar">{u.name?.charAt(0)?.toUpperCase() || 'U'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.email}</div>
                    </div>
                    <UserPlus size={16} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

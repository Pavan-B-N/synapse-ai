import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { channelAPI, authAPI } from '../services/api';
import {
  onChannelApproved, onChannelInvited, onChannelRemoved, onChannelRejected,
} from '../services/socket';
import { Search, Plus, Users, Hash, Loader2, X, Sparkles, Tag, ChevronDown, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import toast from 'react-hot-toast';

interface Channel {
  _id: string;
  name: string;
  description: string;
  profileImage: string;
  adminId: string;
  tags: string[];
  categories: string[];
  memberCount: number;
  postCount: number;
  isAdmin: boolean;
  isMember: boolean;
  hasPendingRequest: boolean;
  createdAt: string;
}

export default function ChannelsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'my' | 'explore'>('my');
  const [recommended, setRecommended] = useState<Channel[]>([]);
  const [createdChannels, setCreatedChannels] = useState<Channel[]>([]);
  const [joinedChannels, setJoinedChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Channel[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', description: '', tags: '', profileImage: '' });
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [hasMoreRecommended, setHasMoreRecommended] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Pagination state
  const PAGE_SIZE = 10;
  const [createdPage, setCreatedPage] = useState(1);
  const [createdTotal, setCreatedTotal] = useState(0);
  const [joinedPage, setJoinedPage] = useState(1);
  const [joinedTotal, setJoinedTotal] = useState(0);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);

  // Preferences
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [prefCategorySearch, setPrefCategorySearch] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Load categories and user preferences on mount (combined in Promise.all)
  useEffect(() => {
    Promise.all([
      channelAPI.categories().catch(() => ({ data: [] })),
      authAPI.getProfile().catch(() => ({ data: { user: { preferences: {} } } })),
    ]).then(([catRes, profRes]: any[]) => {
      setAllCategories(catRes.data || []);
      setPreferredCategories(profRes.data?.user?.preferences?.channelCategories || []);
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, createdRes, joinedRes] = await Promise.all([
        channelAPI.recommended({ limit: PAGE_SIZE }),
        channelAPI.my({ type: 'created', page: createdPage, limit: PAGE_SIZE }),
        channelAPI.my({ type: 'joined', page: joinedPage, limit: PAGE_SIZE }),
      ]);
      setRecommended((recRes as any).data || []);
      setHasMoreRecommended((recRes as any).hasMore ?? (recRes as any).data?.length === PAGE_SIZE);
      setCreatedChannels((createdRes as any).data || []);
      setCreatedTotal((createdRes as any).pagination?.total || 0);
      setJoinedChannels((joinedRes as any).data || []);
      setJoinedTotal((joinedRes as any).pagination?.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  // Initial load — fetch all lists once
  useEffect(() => { loadData(); }, [loadData]);

  // Paginate created channels independently
  useEffect(() => {
    if (createdPage === 1) return; // skip initial — already loaded by loadData
    channelAPI.my({ type: 'created', page: createdPage, limit: PAGE_SIZE })
      .then((res: any) => {
        setCreatedChannels((res as any).data || []);
        setCreatedTotal((res as any).pagination?.total || 0);
      }).catch(() => {});
  }, [createdPage]);

  // Paginate joined channels independently
  useEffect(() => {
    if (joinedPage === 1) return;
    channelAPI.my({ type: 'joined', page: joinedPage, limit: PAGE_SIZE })
      .then((res: any) => {
        setJoinedChannels((res as any).data || []);
        setJoinedTotal((res as any).pagination?.total || 0);
      }).catch(() => {});
  }, [joinedPage]);

  // Real-time: selective local state updates instead of full refetches
  useEffect(() => {
    const c1 = onChannelApproved((data: any) => {
      // Move channel from recommended/pending to joined
      const cid = data?.channelId;
      setRecommended(prev => prev.map(ch => ch._id === cid ? { ...ch, isMember: true, hasPendingRequest: false } : ch));
      setJoinedChannels(prev => {
        if (prev.some(ch => ch._id === cid)) return prev;
        const ch = recommended.find(c => c._id === cid);
        return ch ? [{ ...ch, isMember: true, hasPendingRequest: false }, ...prev] : prev;
      });
    });
    const c2 = onChannelInvited(() => loadData());
    const c3 = onChannelRemoved((data: any) => {
      const cid = data?.channelId;
      setJoinedChannels(prev => prev.filter(ch => ch._id !== cid));
      setCreatedChannels(prev => prev.filter(ch => ch._id !== cid));
    });
    const c4 = onChannelRejected((data: any) => {
      const cid = data?.channelId;
      setRecommended(prev => prev.map(ch => ch._id === cid ? { ...ch, hasPendingRequest: false } : ch));
      setJoinedChannels(prev => prev.map(ch => ch._id === cid ? { ...ch, hasPendingRequest: false } : ch));
    });
    return () => { c1(); c2(); c3(); c4(); };
  }, [loadData, recommended]);

  const loadMoreRecommended = async () => {
    setLoadingMore(true);
    try {
      const res = await channelAPI.recommended({ limit: PAGE_SIZE, skip: recommended.length });
      const data = (res as any).data || [];
      setRecommended(prev => [...prev, ...data]);
      setHasMoreRecommended((res as any).hasMore ?? data.length === PAGE_SIZE);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  const savePreferences = async () => {
    setSavingPrefs(true);
    try {
      await authAPI.updateProfile({ preferences: { channelCategories: preferredCategories } });
      toast.success('Preferences saved! Recommendations will update.');
      setShowPreferences(false);
      // Reload recommended channels with new preferences
      try {
        const recRes = await channelAPI.recommended({ limit: PAGE_SIZE });
        setRecommended((recRes as any).data || []);
        setHasMoreRecommended((recRes as any).hasMore ?? (recRes as any).data?.length === PAGE_SIZE);
      } catch { /* ignore */ }
    } catch { toast.error('Failed to save preferences'); }
    setSavingPrefs(false);
  };

  const togglePreferredCategory = (cat: string) => {
    setPreferredCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : prev.length < 20 ? [...prev, cat] : prev
    );
  };

  const filteredPrefCategories = prefCategorySearch
    ? allCategories.filter(c => c.toLowerCase().includes(prefCategorySearch.toLowerCase()))
    : allCategories;

  // Search with debounce + pagination
  useEffect(() => {
    if (!search.trim()) { setSearchResults(null); setSearchTotal(0); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await channelAPI.list({ search: search.trim(), limit: PAGE_SIZE, page: searchPage });
        setSearchResults((res as any).data || []);
        setSearchTotal((res as any).pagination?.total || 0);
      } catch { setSearchResults([]); setSearchTotal(0); }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchPage]);

  const handleCreate = async () => {
    if (!newChannel.name.trim()) { toast.error('Channel name is required'); return; }
    setCreating(true);
    try {
      const tags = newChannel.tags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await channelAPI.create({ ...newChannel, tags, categories: selectedCategories });
      toast.success('Channel created!');
      setShowCreateModal(false);
      setNewChannel({ name: '', description: '', tags: '', profileImage: '' });
      setSelectedCategories([]);
      navigate(`/channels/${(res as any).data._id}`);
    } catch (err: any) { toast.error(err.message); }
    setCreating(false);
  };

  const handleJoin = async (channelId: string) => {
    try {
      await channelAPI.join(channelId);
      toast.success('Join request sent! Waiting for admin approval.');
      // Locally mark the channel as pending instead of refetching all lists
      setRecommended(prev => prev.map(ch => ch._id === channelId ? { ...ch, hasPendingRequest: true } : ch));
    } catch (err: any) { toast.error(err.message); }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : prev.length < 10 ? [...prev, cat] : prev
    );
  };

  const filteredCategories = categorySearch
    ? allCategories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase()))
    : allCategories;

  const renderChannelCard = (ch: Channel) => (
    <div key={ch._id} className="channel-card" onClick={() => {
      if (ch.isMember || ch.isAdmin) navigate(`/channels/${ch._id}`);
    }}>
      <div className="channel-card-header">
        <div className="channel-avatar" style={ch.profileImage ? { backgroundImage: `url(${ch.profileImage})`, backgroundSize: 'cover' } : {}}>
          {!ch.profileImage && (ch.name?.charAt(0)?.toUpperCase() || '#')}
        </div>
        <div className="channel-card-info">
          <h3 className="channel-card-name">{ch.name}</h3>
          <p className="channel-card-desc">{ch.description || 'No description'}</p>
        </div>
      </div>

      {(ch.categories?.length > 0 || ch.tags?.length > 0) && (
        <div className="channel-card-tags">
          {(ch.categories || []).slice(0, 3).map(cat => (
            <span key={cat} className="channel-tag channel-tag-category">{cat}</span>
          ))}
          {(ch.tags || []).slice(0, 3).map(tag => (
            <span key={tag} className="channel-tag">{tag}</span>
          ))}
        </div>
      )}

      <div className="channel-card-footer">
        <div className="channel-card-stats">
          <span><Users size={13} /> {ch.memberCount}</span>
          <span><Hash size={13} /> {ch.postCount} posts</span>
        </div>
        {ch.isAdmin ? (
          <span className="badge badge-purple" style={{ fontSize: 11 }}>Admin</span>
        ) : ch.isMember ? (
          <span className="badge" style={{ fontSize: 11, background: 'var(--success-bg)', color: 'var(--success)' }}>Joined</span>
        ) : ch.hasPendingRequest ? (
          <span className="badge" style={{ fontSize: 11, background: 'var(--warning-bg)', color: 'var(--warning)' }}>Pending</span>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); handleJoin(ch._id); }} style={{ fontSize: 12, padding: '4px 12px' }}>
            Join
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="channels-page">
      {/* Header */}
      <div className="channels-header">
        <div className="channels-header-left">
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Channels</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>Discover and join channels to learn together</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> Create Channel
        </button>
      </div>

      {/* Global Search */}
      <div className="channels-search">
        <div className="search-input-wrapper" style={{ maxWidth: 480, position: 'relative' }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search channels by name, topic, or category..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSearchPage(1); }}
            className="form-input"
            style={{ paddingLeft: 36, paddingRight: search ? 36 : 14 }}
          />
          {search && (
            <button className="btn btn-ghost" onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, minWidth: 'auto' }}>
              <X size={14} />
            </button>
          )}
          {searchLoading && (
            <Loader2 size={14} className="spin" style={{ position: 'absolute', right: search ? 36 : 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-primary)' }} />
          )}
        </div>
      </div>

      {/* Tabs (hidden when searching) */}
      {!searchResults && (
        <div className="channels-tabs">
          <button className={`channels-tab ${tab === 'my' ? 'active' : ''}`} onClick={() => setTab('my')}>
            <Hash size={14} /> My Channels
          </button>
          <button className={`channels-tab ${tab === 'explore' ? 'active' : ''}`} onClick={() => setTab('explore')}>
            <Sparkles size={14} /> Explore
          </button>
        </div>
      )}

      {searchResults && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          {searchTotal} result{searchTotal !== 1 ? 's' : ''} for "{search}"
        </div>
      )}

      {/* Channel Grid */}
      {loading && !searchResults ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <Loader2 size={32} className="spin" style={{ color: 'var(--accent-primary)' }} />
        </div>
      ) : searchResults ? (
        searchResults.length === 0 ? (
          <div className="channels-empty">
            <Hash size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>No channels match your search</p>
          </div>
        ) : (
          <>
            <div className="channels-grid">{searchResults.map(renderChannelCard)}</div>
            {searchTotal > PAGE_SIZE && (
              <div className="channels-pagination">
                <button className="btn btn-ghost btn-sm" disabled={searchPage <= 1} onClick={() => setSearchPage(p => p - 1)}>
                  <ChevronLeft size={14} /> Prev
                </button>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Page {searchPage} of {Math.ceil(searchTotal / PAGE_SIZE)}
                </span>
                <button className="btn btn-ghost btn-sm" disabled={searchPage >= Math.ceil(searchTotal / PAGE_SIZE)} onClick={() => setSearchPage(p => p + 1)}>
                  Next <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )
      ) : tab === 'my' ? (
        createdChannels.length === 0 && joinedChannels.length === 0 ? (
          <div className="channels-empty">
            <Hash size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>You haven't joined any channels yet</p>
          </div>
        ) : (
          <>
            {(createdChannels.length > 0 || createdTotal > 0) && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Created by You ({createdTotal})
                </h3>
                <div className="channels-grid">{createdChannels.map(renderChannelCard)}</div>
                {createdTotal > PAGE_SIZE && (
                  <div className="channels-pagination">
                    <button className="btn btn-ghost btn-sm" disabled={createdPage <= 1} onClick={() => setCreatedPage(p => p - 1)}>
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Page {createdPage} of {Math.ceil(createdTotal / PAGE_SIZE)}
                    </span>
                    <button className="btn btn-ghost btn-sm" disabled={createdPage >= Math.ceil(createdTotal / PAGE_SIZE)} onClick={() => setCreatedPage(p => p + 1)}>
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
            {(joinedChannels.length > 0 || joinedTotal > 0) && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Joined Channels ({joinedTotal})
                </h3>
                <div className="channels-grid">{joinedChannels.map(renderChannelCard)}</div>
                {joinedTotal > PAGE_SIZE && (
                  <div className="channels-pagination">
                    <button className="btn btn-ghost btn-sm" disabled={joinedPage <= 1} onClick={() => setJoinedPage(p => p - 1)}>
                      <ChevronLeft size={14} /> Prev
                    </button>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      Page {joinedPage} of {Math.ceil(joinedTotal / PAGE_SIZE)}
                    </span>
                    <button className="btn btn-ghost btn-sm" disabled={joinedPage >= Math.ceil(joinedTotal / PAGE_SIZE)} onClick={() => setJoinedPage(p => p + 1)}>
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )
      ) : tab === 'explore' ? (
        <>
          {/* Preferences button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPreferences(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <Settings size={14} /> Preferences
              {preferredCategories.length > 0 && (
                <span className="badge badge-purple" style={{ fontSize: 10, marginLeft: 4 }}>{preferredCategories.length}</span>
              )}
            </button>
          </div>
          {recommended.length === 0 ? (
            <div className="channels-empty">
              <Hash size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 16 }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>No channels found. Set your preferences or create one!</p>
            </div>
          ) : (
            <div className="channels-grid">{recommended.map(renderChannelCard)}</div>
          )}
          {hasMoreRecommended && recommended.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <button className="btn btn-ghost" onClick={loadMoreRecommended} disabled={loadingMore}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                {loadingMore ? <Loader2 size={16} className="spin" /> : <ChevronDown size={16} />}
                Show More
              </button>
            </div>
          )}
        </>
      ) : null}

      {/* Preferences Modal */}
      {showPreferences && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Channel Preferences</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowPreferences(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Select your interests to get personalized channel recommendations. Choose up to 20 categories.
              </p>
              {preferredCategories.length > 0 && (
                <div className="create-modal-selected-cats">
                  {preferredCategories.map(cat => (
                    <span key={cat} className="channel-tag channel-tag-category channel-tag-removable" onClick={() => togglePreferredCategory(cat)}>
                      {cat} <X size={10} />
                    </span>
                  ))}
                </div>
              )}
              <input className="form-input" placeholder="Search categories..." value={prefCategorySearch} onChange={e => setPrefCategorySearch(e.target.value)} style={{ fontSize: 13 }} />
              <div className="create-modal-categories-grid">
                {filteredPrefCategories.slice(0, 60).map(cat => (
                  <button
                    key={cat}
                    className={`create-modal-cat-btn ${preferredCategories.includes(cat) ? 'selected' : ''}`}
                    onClick={() => togglePreferredCategory(cat)}
                    type="button"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPreferences(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePreferences} disabled={savingPrefs}>
                {savingPrefs ? <Loader2 size={16} className="spin" /> : <Settings size={16} />} Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Create Channel</h3>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label">Channel Name *</label>
                <input className="form-input" placeholder="e.g. Machine Learning Study Group" value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} maxLength={100} />
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} placeholder="What is this channel about?" value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} maxLength={500} />
              </div>

              {/* Categories */}
              <div>
                <label className="form-label"><Tag size={12} style={{ marginRight: 4 }} /> Categories (select up to 10)</label>
                {selectedCategories.length > 0 && (
                  <div className="create-modal-selected-cats">
                    {selectedCategories.map(cat => (
                      <span key={cat} className="channel-tag channel-tag-category channel-tag-removable" onClick={() => toggleCategory(cat)}>
                        {cat} <X size={10} />
                      </span>
                    ))}
                  </div>
                )}
                <input className="form-input" placeholder="Search categories..." value={categorySearch} onChange={e => setCategorySearch(e.target.value)} style={{ marginBottom: 8, fontSize: 13 }} />
                <div className="create-modal-categories-grid">
                  {filteredCategories.slice(0, 40).map(cat => (
                    <button
                      key={cat}
                      className={`create-modal-cat-btn ${selectedCategories.includes(cat) ? 'selected' : ''}`}
                      onClick={() => toggleCategory(cat)}
                      type="button"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="form-label">Tags (comma separated, optional)</label>
                <input className="form-input" placeholder="e.g. machine-learning, python" value={newChannel.tags} onChange={e => setNewChannel(p => ({ ...p, tags: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Profile Image URL (optional)</label>
                <input className="form-input" placeholder="https://..." value={newChannel.profileImage} onChange={e => setNewChannel(p => ({ ...p, profileImage: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

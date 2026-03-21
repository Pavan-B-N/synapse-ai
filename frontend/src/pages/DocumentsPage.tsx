import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { documentAPI, groupAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { onDocumentStatus, DocStatusEvent, onDocShared, onDocUnshared } from '../services/socket';
import { FileText, Trash2, Loader2, Search, X, Upload, Users, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Doc {
  _id: string;
  title: string;
  type: string;
  status: string;
  size: number;
  createdAt: string;
  userId?: string;
  sharedWith?: string[];
}

const DOC_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  pdf: { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' },
  text: { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' },
  other: { bg: 'rgba(156, 163, 175, 0.12)', color: '#9ca3af' },
};
const getTypeStyle = (t: string) => DOC_TYPE_COLORS[t] || DOC_TYPE_COLORS.other;

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth() as any;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [myDocsVisible, setMyDocsVisible] = useState(5);
  const [sharedDocsVisible, setSharedDocsVisible] = useState(5);

  useEffect(() => { loadDocs(); }, []);

  // Real-time document status updates via WebSocket
  useEffect(() => {
    const cleanup = onDocumentStatus((ev: DocStatusEvent) => {
      setDocs(prev => prev.map(d =>
        d._id === ev.documentId ? { ...d, status: ev.status } : d
      ));
    });
    return cleanup;
  }, []);

  // Real-time: refresh docs when someone shares a document with us
  useEffect(() => {
    const cleanup = onDocShared(() => {
      loadDocs();
    });
    return cleanup;
  }, []);

  // Real-time: refresh docs when document is unshared or deleted
  useEffect(() => {
    const cleanup = onDocUnshared(() => {
      loadDocs();
    });
    return cleanup;
  }, []);

  const loadDocs = async () => {
    try {
      const res = await documentAPI.getAll({ limit: 100 });
      setDocs((res as any).data?.documents || []);
    } catch { toast.error('Failed to load documents'); }
    finally { setLoading(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await documentAPI.delete(deleteTarget._id);
      // Also remove from all workspaces
      try { await groupAPI.cleanupDocument(deleteTarget._id); } catch {}
      setDocs(prev => prev.filter(d => d._id !== deleteTarget._id));
      toast.success(`"${deleteTarget.title}" deleted`);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally { setDeleting(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      try {
        await documentAPI.upload(file);
        successCount++;
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }
    if (successCount > 0) {
      toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
      loadDocs();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filtered = docs.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  const myDocs = filtered.filter(d => d.userId === user?._id);
  const sharedDocs = filtered.filter(d => d.userId !== user?._id);

  const formatSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Document Store</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Browse, manage, and delete your uploaded documents.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.csv"
            multiple
            onChange={handleUpload}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Upload
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search documents..."
          style={{
            width: '100%', padding: '10px 14px 10px 38px', background: 'var(--surface-1)',
            border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)',
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><FileText size={32} /></div>
          <h3 className="empty-state-title">{search ? 'No matches' : 'No documents yet'}</h3>
          <p className="empty-state-desc">{search ? 'Try a different search term.' : 'Upload documents from a workspace to see them here.'}</p>
        </div>
      ) : (
        <>
          {/* Uploaded by you */}
          {myDocs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Upload size={14} style={{ color: 'var(--accent-primary)' }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Uploaded by you</h3>
                <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', color: 'var(--accent-primary)', fontWeight: 600 }}>{myDocs.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myDocs.slice(0, myDocsVisible).map(doc => {
                  const ts = getTypeStyle(doc.type || 'other');
                  return (
                    <div key={doc._id} className="doc-store-row" onClick={() => navigate(`/documents/${doc._id}`)}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ts.bg, flexShrink: 0 }}>
                        <FileText size={18} style={{ color: ts.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          <span style={{ fontWeight: 700, textTransform: 'uppercase', color: ts.color, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: ts.bg }}>
                            {doc.type || 'text'}
                          </span>
                          {doc.size > 0 && <span>{formatSize(doc.size)}</span>}
                          <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                          {doc.status === 'processing' && <span style={{ color: 'var(--warning)' }}>Processing...</span>}
                          {doc.sharedWith && doc.sharedWith.length > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-primary)' }}>
                              <Share2 size={10} /> Shared ({doc.sharedWith.length})
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        style={{ width: 34, height: 34, color: 'var(--text-muted)', flexShrink: 0 }}
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                        title="Delete document"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {myDocs.length > myDocsVisible && (
                <button
                  onClick={() => setMyDocsVisible(prev => prev + 5)}
                  style={{
                    marginTop: 8, padding: '8px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 8, color: 'var(--accent-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%',
                  }}
                >
                  Load more ({myDocs.length - myDocsVisible} remaining)
                </button>
              )}
            </div>
          )}

          {/* Shared with you */}
          {sharedDocs.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Users size={14} style={{ color: '#22c55e' }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Shared with you</h3>
                <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', color: '#22c55e', fontWeight: 600 }}>{sharedDocs.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sharedDocs.slice(0, sharedDocsVisible).map(doc => {
                  const ts = getTypeStyle(doc.type || 'other');
                  return (
                    <div key={doc._id} className="doc-store-row" onClick={() => navigate(`/documents/${doc._id}`)}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ts.bg, flexShrink: 0 }}>
                        <FileText size={18} style={{ color: ts.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          <span style={{ fontWeight: 700, textTransform: 'uppercase', color: ts.color, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: ts.bg }}>
                            {doc.type || 'text'}
                          </span>
                          {doc.size > 0 && <span>{formatSize(doc.size)}</span>}
                          <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                          {doc.status === 'processing' && <span style={{ color: 'var(--warning)' }}>Processing...</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {sharedDocs.length > sharedDocsVisible && (
                <button
                  onClick={() => setSharedDocsVisible(prev => prev + 5)}
                  style={{
                    marginTop: 8, padding: '8px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 8, color: '#22c55e', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%',
                  }}
                >
                  Load more ({sharedDocs.length - sharedDocsVisible} remaining)
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="modal-content" style={{ maxWidth: 420, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Delete Document</h3>
              <button onClick={() => setDeleteTarget(null)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>"{deleteTarget.title}"</strong>?
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
              This will permanently remove the file, its vectors, and detach it from all workspaces.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteTarget(null)}
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button className="btn" onClick={confirmDelete} disabled={deleting}
                style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

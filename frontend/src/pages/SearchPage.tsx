import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiAPI } from '../services/api';
import { Search as SearchIcon, FileText, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setVisibleCount(5);
    try {
      const res = await aiAPI.search({ q: query, topK: 10 });
      setResults(res.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Search Bar */}
      <form onSubmit={handleSearch} style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{
          display: 'flex', gap: 'var(--space-3)',
          alignItems: 'stretch', maxWidth: '700px', margin: '0 auto',
        }}>
          <div className="header-search" style={{
            flex: 1, minWidth: 0, borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-base)',
          }}>
            <SearchIcon size={20} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across your knowledge base using natural language..."
              style={{ fontSize: 'var(--text-base)' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
            {loading ? <div className="spinner" /> : <><SearchIcon size={16} /> Search</>}
          </button>
        </div>
      </form>

      {/* Results */}
      {results && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 'var(--space-4)',
          }}>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              {results.totalResults} results for "{results.query}"
            </h3>
            <span className="badge badge-purple">
              <Zap size={12} style={{ marginRight: 4 }} /> Semantic Search
            </span>
          </div>

          {results.results?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {results.results.slice(0, visibleCount).map((result, i) => (
                <div key={i} className="card" style={{ cursor: 'pointer' }} onClick={() => result.document?.id && navigate(`/documents/${result.document.id}`)}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start',
                    justifyContent: 'space-between', marginBottom: 'var(--space-3)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <FileText size={18} style={{ color: 'var(--accent-secondary)' }} />
                      <span style={{ fontWeight: 600 }}>{result.document?.title || 'Unknown'}</span>
                      {result.document?.type && (
                        <span className="badge badge-blue">{result.document.type}</span>
                      )}
                    </div>
                    <div style={{
                      background: `hsl(${Math.round(result.score * 120)}, 70%, 30%)`,
                      color: 'white', padding: '2px 10px', borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--text-xs)', fontWeight: 600,
                    }}>
                      {(result.score * 100).toFixed(1)}% match
                    </div>
                  </div>

                  {result.chunk && (
                    <p style={{
                      fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                      lineHeight: 1.7, borderLeft: '3px solid var(--accent-primary)',
                      paddingLeft: 'var(--space-4)', marginBottom: 'var(--space-2)',
                    }}>
                      {result.chunk}
                    </p>
                  )}

                  {result.document?.tags?.length > 0 && (
                    <div className="doc-card-tags">
                      {result.document.tags.slice(0, 5).map((tag, j) => (
                        <span key={j} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {results.results.length > visibleCount && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setVisibleCount(results.results.length)}
                  style={{ alignSelf: 'center', marginTop: 'var(--space-2)' }}
                >
                  Load More ({results.results.length - visibleCount} remaining)
                </button>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <SearchIcon size={32} />
              </div>
              <h3 className="empty-state-title">No results found</h3>
              <p className="empty-state-desc">
                Try different keywords or upload more documents to expand your knowledge base
              </p>
            </div>
          )}
        </div>
      )}

      {!results && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <SearchIcon size={32} />
          </div>
          <h3 className="empty-state-title">Semantic Search</h3>
          <p className="empty-state-desc">
            Search across all your documents using AI-powered semantic understanding. 
            Unlike keyword search, Synapse AI understands the meaning of your query.
          </p>
        </div>
      )}
    </div>
  );
}

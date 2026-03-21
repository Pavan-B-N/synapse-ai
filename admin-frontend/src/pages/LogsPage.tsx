import { useEffect, useState, useCallback } from 'react';
import { api, LogEntry, Pagination } from '../services/api';

const SERVICES = ['', 'api-gateway-server', 'auth-server', 'core-server', 'document-server', 'ai-server', 'log-server'];
const LEVELS = ['', 'info', 'warn', 'error', 'debug'];

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);

  const [service, setService] = useState('');
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (service) params.service = service;
      if (level) params.level = level;
      if (search) params.search = search;
      const res = await api.getLogs(params);
      setLogs(res.data.logs);
      setPagination(res.data.pagination);
    } catch { /* ignore */ }
    setLoading(false);
  }, [service, level, search, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Log Explorer</h2>
        <span className="text-sm text-gray-500">{pagination.total.toLocaleString()} total</span>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-5">
        <select value={service} onChange={e => { setService(e.target.value); setPage(1); }}
          className="bg-surface-light border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-accent">
          <option value="">All Services</option>
          {SERVICES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}
          className="bg-surface-light border border-gray-700 rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-accent">
          <option value="">All Levels</option>
          {LEVELS.filter(Boolean).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search messages..."
          className="flex-1 min-w-[200px] px-3 py-2 bg-surface-light border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-accent" />
        <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded text-sm font-medium">
          Search
        </button>
      </form>

      {/* Log Table */}
      <div className="bg-surface-light border border-gray-800 rounded-lg overflow-hidden mb-4">
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No logs found</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500">
                <th className="text-left px-4 py-2.5 w-28">Time</th>
                <th className="text-left px-4 py-2.5 w-36">Service</th>
                <th className="text-left px-4 py-2.5 w-16">Level</th>
                <th className="text-left px-4 py-2.5">Message</th>
                <th className="text-left px-4 py-2.5 w-16">Status</th>
                <th className="text-left px-4 py-2.5 w-20">Duration</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <LogRow key={log._id} log={log} expanded={expanded === log._id} onToggle={() => setExpanded(expanded === log._id ? null : log._id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-surface-light border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40">
            Prev
          </button>
          <span className="text-sm text-gray-500">Page {page} of {pagination.pages}</span>
          <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-surface-light border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200 disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function LogRow({ log, expanded, onToggle }: { log: LogEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-gray-800/50 hover:bg-surface-lighter cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-2 text-gray-500 font-mono">{new Date(log.timestamp || log.createdAt).toLocaleTimeString()}</td>
        <td className="px-4 py-2 text-accent">{log.service}</td>
        <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${levelBadge(log.level)}`}>{log.level.toUpperCase()}</span></td>
        <td className="px-4 py-2 text-gray-300 max-w-md truncate">{log.message}</td>
        <td className="px-4 py-2 text-gray-400">{log.statusCode ?? '—'}</td>
        <td className="px-4 py-2 text-gray-400">{log.responseTime !== undefined ? `${log.responseTime}ms` : '—'}</td>
      </tr>
      {expanded && (
        <tr className="bg-surface-lighter">
          <td colSpan={6} className="px-6 py-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {log.raid && <Detail label="RAID" value={log.raid} />}
              {log.userId && <Detail label="User ID" value={log.userId} />}
              {log.method && <Detail label="Method" value={log.method} />}
              {log.path && <Detail label="Path" value={log.path} />}
              {log.ip && <Detail label="IP" value={log.ip} />}
              {log.userAgent && <Detail label="User Agent" value={log.userAgent} />}
              {log.traceId && <Detail label="Trace ID" value={log.traceId} />}
            </div>
            {log.meta && Object.keys(log.meta).length > 0 && (
              <pre className="mt-3 p-3 bg-surface rounded text-[11px] text-gray-400 overflow-x-auto">
                {JSON.stringify(log.meta, null, 2)}
              </pre>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}:</span>
      <span className="ml-1 text-gray-300 font-mono break-all">{value}</span>
    </div>
  );
}

function levelBadge(level: string): string {
  switch (level) {
    case 'error': return 'bg-red-500/20 text-red-400';
    case 'warn': return 'bg-yellow-500/20 text-yellow-400';
    case 'info': return 'bg-blue-500/20 text-blue-400';
    case 'debug': return 'bg-gray-500/20 text-gray-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

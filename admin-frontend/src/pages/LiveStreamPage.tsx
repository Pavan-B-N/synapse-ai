import { useEffect, useRef, useState } from 'react';
import { LogEntry } from '../services/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const MAX_ENTRIES = 200;

export default function LiveStreamPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const url = `${API_BASE}/api/logs/stream${token ? `?token=${token}` : ''}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);
    es.onmessage = (event) => {
      try {
        const log: LogEntry = JSON.parse(event.data);
        setEntries(prev => {
          const next = [...prev, log];
          return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
        });
      } catch { /* heartbeat or invalid */ }
    };
    es.onerror = () => setConnected(false);

    return () => { es.close(); };
  }, []);

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, paused]);

  const displayed = filter
    ? entries.filter(e =>
        e.service.includes(filter) || e.level.includes(filter) || e.message.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Live Log Stream</h2>
          <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-success' : 'text-danger'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-success animate-pulse' : 'bg-danger'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Filter..."
            className="px-3 py-1.5 bg-surface-light border border-gray-700 rounded text-sm text-gray-100 w-48 focus:outline-none focus:border-accent" />
          <button onClick={() => setPaused(p => !p)}
            className={`px-3 py-1.5 rounded text-sm font-medium border ${
              paused ? 'border-success text-success hover:bg-success/10' : 'border-warning text-warning hover:bg-warning/10'
            }`}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={() => setEntries([])}
            className="px-3 py-1.5 border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200">
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 bg-surface-light border border-gray-800 rounded-lg overflow-y-auto font-mono text-[11px] leading-relaxed p-3">
        {displayed.length === 0 ? (
          <div className="text-gray-500 text-center py-10">Waiting for log events...</div>
        ) : (
          displayed.map((log, i) => (
            <div key={`${log._id || i}`} className="flex gap-2 py-0.5 hover:bg-surface-lighter px-1 rounded">
              <span className="text-gray-600 shrink-0">{new Date(log.timestamp || log.createdAt).toLocaleTimeString()}</span>
              <span className={`shrink-0 w-14 text-right ${levelColor(log.level)}`}>[{log.level.toUpperCase()}]</span>
              <span className="text-accent shrink-0 w-36 truncate">{log.service}</span>
              <span className="text-gray-300">{log.message}</span>
              {log.statusCode && <span className="text-gray-600 shrink-0">{log.statusCode}</span>}
              {log.responseTime !== undefined && <span className="text-gray-600 shrink-0">{log.responseTime}ms</span>}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-2 text-xs text-gray-600 text-right">
        {displayed.length} entries (max {MAX_ENTRIES})
      </div>
    </div>
  );
}

function levelColor(level: string): string {
  switch (level) {
    case 'error': return 'text-red-400';
    case 'warn': return 'text-yellow-400';
    case 'info': return 'text-blue-400';
    case 'debug': return 'text-gray-500';
    default: return 'text-gray-500';
  }
}

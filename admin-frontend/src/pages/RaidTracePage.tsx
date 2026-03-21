import { useState, useEffect } from 'react';
import { api, RaidTrace, LogEntry, RecentRaid } from '../services/api';

export default function RaidTracePage() {
  const [raidId, setRaidId] = useState('');
  const [trace, setTrace] = useState<RaidTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [recentRaids, setRecentRaids] = useState<RecentRaid[]>([]);

  useEffect(() => {
    api.getRecentRaids().then(res => setRecentRaids(res.data.raids)).catch(() => {});
  }, []);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!raidId.trim()) return;
    setError('');
    setLoading(true);
    setTrace(null);
    setSelectedLog(null);
    try {
      const res = await api.getRaidTrace(raidId.trim());
      setTrace(res.data);
      // Persist this RAID search
      const label = res.data.summary.totalLogs > 0
        ? `${res.data.summary.serviceCount} services, ${res.data.summary.totalLogs} logs`
        : '';
      api.saveRecentRaid(raidId.trim(), label).then(() =>
        api.getRecentRaids().then(r => setRecentRaids(r.data.raids)).catch(() => {})
      ).catch(() => {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch RAID trace');
    }
    setLoading(false);
  };

  const selectRecent = (raid: string) => {
    setRaidId(raid);
    setTimeout(() => {
      setError('');
      setLoading(true);
      setTrace(null);
      setSelectedLog(null);
      api.getRaidTrace(raid).then(res => {
        setTrace(res.data);
        setLoading(false);
      }).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to fetch RAID trace');
        setLoading(false);
      });
    }, 0);
  };

  const isEmpty = trace && trace.summary.totalLogs === 0;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">RAID Trace Viewer</h2>

      <form onSubmit={handleSearch} className="flex gap-3 mb-4">
        <input
          type="text" value={raidId} onChange={e => setRaidId(e.target.value)}
          placeholder="Enter RAID (Request Activity ID)..."
          className="flex-1 px-4 py-2.5 bg-surface-light border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-accent"
        />
        <button type="submit" disabled={loading}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white rounded text-sm font-medium transition-colors disabled:opacity-50">
          {loading ? 'Tracing...' : 'Trace'}
        </button>
      </form>

      {/* Recent RAIDs */}
      {recentRaids.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-xs text-gray-500">Recent:</span>
          {recentRaids.map(r => (
            <button key={r._id} onClick={() => selectRecent(r.raid)}
              className="px-2.5 py-1 bg-surface-light border border-gray-700 rounded text-xs text-gray-400 hover:text-accent hover:border-accent/50 transition-colors font-mono truncate max-w-[200px]"
              title={r.label ? `${r.raid} — ${r.label}` : r.raid}>
              {r.raid.substring(0, 8)}...
              {r.label && <span className="ml-1 text-gray-600 font-sans">({r.label})</span>}
            </button>
          ))}
        </div>
      )}

      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm mb-4">{error}</div>}

      {isEmpty && (
        <div className="p-6 bg-surface-light border border-gray-800 rounded-lg text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-medium text-gray-300 mb-1">No logs found</h3>
          <p className="text-sm text-gray-500">No log entries exist for RAID <span className="font-mono text-gray-400">{trace.raid}</span>. The RAID may be invalid or logs may have expired.</p>
        </div>
      )}

      {trace && !isEmpty && (
        <>
          {/* Summary */}
          <div className="bg-surface-light border border-gray-800 rounded-lg p-5 mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Request Summary</h3>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-gray-500">RAID</p>
                <p className="text-gray-200 font-mono text-xs break-all">{trace.raid}</p>
              </div>
              <div>
                <p className="text-gray-500">Services Hit</p>
                <p className="text-gray-200">{trace.summary.serviceCount} ({trace.summary.services.join(', ')})</p>
              </div>
              <div>
                <p className="text-gray-500">Total Duration</p>
                <p className="text-gray-200">{trace.summary.totalDurationMs}ms</p>
              </div>
              <div>
                <p className="text-gray-500">Total Logs</p>
                <p className="text-gray-200">{trace.summary.totalLogs}</p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <p className={trace.summary.hasErrors ? 'text-danger font-medium' : 'text-success font-medium'}>
                  {trace.summary.hasErrors ? 'Has Errors' : 'Healthy'}
                </p>
              </div>
            </div>
          </div>

          {/* Service Breakdown */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">By Service</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(trace.byService).map(([service, logs]) => (
                <div key={service} className="bg-surface-light border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-accent">{service}</h4>
                    <span className="text-xs text-gray-500">{logs.length} logs</span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {logs.map(log => (
                      <div key={log._id}
                        onClick={() => setSelectedLog(selectedLog?._id === log._id ? null : log)}
                        className={`flex items-start gap-2 text-xs cursor-pointer rounded px-1.5 py-1 transition-colors ${selectedLog?._id === log._id ? 'bg-accent/10 ring-1 ring-accent/30' : 'hover:bg-surface-lighter'}`}>
                        <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${levelBadge(log.level)}`}>
                          {log.level.toUpperCase()}
                        </span>
                        <span className="text-gray-500 shrink-0">{new Date(log.timestamp || log.createdAt).toLocaleTimeString()}</span>
                        <span className="text-gray-300 truncate">{log.message}</span>
                        {log.statusCode && <span className="text-gray-500 shrink-0">{log.statusCode}</span>}
                        {log.responseTime !== undefined && <span className="text-gray-500 shrink-0">{log.responseTime}ms</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Full Timeline */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Timeline</h3>
            <div className="bg-surface-light border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left px-4 py-2.5">Time</th>
                    <th className="text-left px-4 py-2.5">Service</th>
                    <th className="text-left px-4 py-2.5">Level</th>
                    <th className="text-left px-4 py-2.5">Message</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    <th className="text-left px-4 py-2.5">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.timeline.map(log => (
                    <tr key={log._id}
                      onClick={() => setSelectedLog(selectedLog?._id === log._id ? null : log)}
                      className={`border-b border-gray-800/50 cursor-pointer transition-colors ${selectedLog?._id === log._id ? 'bg-accent/10' : 'hover:bg-surface-lighter'}`}>
                      <td className="px-4 py-2 text-gray-500 font-mono">{new Date(log.timestamp || log.createdAt).toLocaleTimeString()}</td>
                      <td className="px-4 py-2 text-accent">{log.service}</td>
                      <td className="px-4 py-2"><span className={`px-1.5 py-0.5 rounded ${levelBadge(log.level)}`}>{log.level}</span></td>
                      <td className="px-4 py-2 text-gray-300 max-w-md truncate">{log.message}</td>
                      <td className="px-4 py-2 text-gray-400">{log.statusCode ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-400">{log.responseTime !== undefined ? `${log.responseTime}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detail Panel */}
          {selectedLog && <LogDetailPanel log={selectedLog} onClose={() => setSelectedLog(null)} />}
        </>
      )}
    </div>
  );
}

function LogDetailPanel({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-gray-700 rounded-lg w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Log Entry Detail</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <DetailItem label="Service" value={log.service} accent />
            <DetailItem label="Level" badge={log.level} />
            <DetailItem label="Time" value={new Date(log.timestamp || log.createdAt).toLocaleString()} />
            <DetailItem label="Status Code" value={log.statusCode != null ? String(log.statusCode) : '—'} />
            <DetailItem label="Response Time" value={log.responseTime != null ? `${log.responseTime}ms` : '—'} />
            <DetailItem label="User ID" value={log.userId || '—'} mono />
            <DetailItem label="Method" value={log.method || '—'} />
            <DetailItem label="Path" value={log.path || '—'} mono />
            <DetailItem label="IP" value={log.ip || '—'} mono />
          </div>
          {log.raid && (
            <div className="text-xs">
              <span className="text-gray-500">RAID: </span>
              <span className="text-gray-300 font-mono">{log.raid}</span>
            </div>
          )}
          {log.traceId && (
            <div className="text-xs">
              <span className="text-gray-500">Trace ID: </span>
              <span className="text-gray-300 font-mono">{log.traceId}</span>
            </div>
          )}

          {/* Message */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Message</p>
            <div className={`text-sm p-3 rounded font-mono whitespace-pre-wrap break-all ${log.level === 'error' ? 'bg-red-500/10 text-red-300 border border-red-500/20' : 'bg-surface-light text-gray-200'}`}>
              {log.message}
            </div>
          </div>

          {/* Metadata */}
          {log.meta && Object.keys(log.meta).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Metadata</p>
              <div className="bg-surface-light rounded p-3 text-xs">
                {Object.entries(log.meta).map(([key, value]) => {
                  if (key === 'stack') return null; // show separately
                  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                  return (
                    <div key={key} className="flex gap-2 py-1 border-b border-gray-800/50 last:border-0">
                      <span className="text-accent font-medium shrink-0 min-w-[100px]">{key}</span>
                      <span className="text-gray-300 font-mono break-all whitespace-pre-wrap">{display}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stack trace */}
          {(log.meta as any)?.stack && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Stack Trace</p>
              <pre className="bg-red-950/30 border border-red-900/30 rounded p-3 text-xs text-red-300 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                {String((log.meta as any).stack)}
              </pre>
            </div>
          )}

          {/* User Agent */}
          {log.userAgent && (
            <div className="text-xs">
              <span className="text-gray-500">User Agent: </span>
              <span className="text-gray-400">{log.userAgent}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, badge, accent, mono }: { label: string; value?: string; badge?: string; accent?: boolean; mono?: boolean }) {
  return (
    <div>
      <p className="text-gray-500 mb-0.5">{label}</p>
      {badge ? (
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${levelBadge(badge)}`}>{badge.toUpperCase()}</span>
      ) : (
        <p className={`text-gray-200 ${accent ? 'text-accent' : ''} ${mono ? 'font-mono' : ''} break-all`}>{value}</p>
      )}
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

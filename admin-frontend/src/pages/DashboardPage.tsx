import { useEffect, useState } from 'react';
import { api, LogStats } from '../services/api';

export default function DashboardPage() {
  const [stats, setStats] = useState<LogStats | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await api.getStats(hours);
      setStats(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchStats(); }, [hours]);

  if (loading && !stats) return <Skeleton />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <select value={hours} onChange={e => setHours(Number(e.target.value))}
          className="bg-surface-light border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-accent">
          <option value={1}>Last 1h</option>
          <option value={6}>Last 6h</option>
          <option value={24}>Last 24h</option>
          <option value={72}>Last 3d</option>
          <option value={168}>Last 7d</option>
        </select>
      </div>

      {stats && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total Logs" value={stats.totalLogs.toLocaleString()} />
            <KpiCard label="Errors" value={stats.errorCount.toLocaleString()} color="text-danger" />
            <KpiCard label="Error Rate" value={stats.errorRate} color={parseFloat(stats.errorRate) > 5 ? 'text-danger' : 'text-success'} />
            <KpiCard label="SSE Clients" value={String(stats.sseClients)} />
          </div>

          {/* By Service */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-surface-light border border-gray-800 rounded-lg p-5">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Logs by Service</h3>
              <div className="space-y-3">
                {Object.entries(stats.byService).sort(([, a], [, b]) => b - a).map(([svc, count]) => (
                  <div key={svc}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{svc}</span>
                      <span className="text-gray-500">{count.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${(count / stats.totalLogs) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-light border border-gray-800 rounded-lg p-5">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Logs by Level</h3>
              <div className="space-y-3">
                {Object.entries(stats.byLevel).map(([level, count]) => (
                  <div key={level} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${levelColor(level)}`} />
                      <span className="text-sm text-gray-300 capitalize">{level}</span>
                    </div>
                    <span className="text-sm text-gray-500">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, color = 'text-gray-100' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-surface-light border border-gray-800 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function levelColor(level: string): string {
  switch (level) {
    case 'error': return 'bg-danger';
    case 'warn': return 'bg-warning';
    case 'info': return 'bg-accent';
    case 'debug': return 'bg-gray-500';
    default: return 'bg-gray-600';
  }
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-surface-light rounded w-40" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-light rounded-lg" />)}
      </div>
    </div>
  );
}

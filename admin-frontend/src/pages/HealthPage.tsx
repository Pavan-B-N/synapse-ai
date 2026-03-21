import { useEffect, useState, useCallback } from 'react';
import { api, ServiceHealth, HealthAggregate } from '../services/api';

export default function HealthPage() {
  const [data, setData] = useState<HealthAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.getHealthAggregate();
      setData(res);
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    if (!autoRefresh) return;
    const timer = setInterval(fetchHealth, 15000);
    return () => clearInterval(timer);
  }, [fetchHealth, autoRefresh]);

  const allHealthy = data?.services.every(s => s.status === 'healthy') ?? false;
  const healthyCount = data?.services.filter(s => s.status === 'healthy').length ?? 0;
  const totalCount = data?.services.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Service Health</h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
              className="accent-accent" />
            Auto-refresh (15s)
          </label>
          <button onClick={fetchHealth}
            className="px-4 py-1.5 bg-surface-light border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200">
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm mb-4">{error}</div>}

      {loading && !data ? (
        <div className="text-gray-500">Loading...</div>
      ) : data && (
        <>
          {/* Overall Status Banner */}
          <div className={`rounded-lg p-5 mb-6 border ${
            allHealthy ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center gap-3">
              <span className={`text-3xl`}>{allHealthy ? '✅' : '⚠️'}</span>
              <div>
                <p className={`text-lg font-semibold ${allHealthy ? 'text-success' : 'text-danger'}`}>
                  {allHealthy ? 'All Systems Operational' : `${totalCount - healthyCount} Service(s) Down`}
                </p>
                <p className="text-sm text-gray-500">
                  {healthyCount}/{totalCount} services healthy &middot;
                  Gateway uptime: {formatUptime(data.gateway.uptime)}
                </p>
              </div>
            </div>
          </div>

          {/* Service Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.services.map(svc => (
              <ServiceCard key={svc.name} service={svc} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const healthy = service.status === 'healthy';
  return (
    <div className={`bg-surface-light border rounded-lg p-5 ${
      healthy ? 'border-gray-800' : 'border-red-500/30'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-200">{service.name}</h3>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${healthy ? 'text-success' : 'text-danger'}`}>
          <span className={`w-2 h-2 rounded-full ${healthy ? 'bg-success' : 'bg-danger'}`} />
          {service.status}
        </span>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Latency</span>
          <span className={`${(service.latency ?? 0) > 1000 ? 'text-warning' : 'text-gray-300'}`}>
            {service.latency !== undefined ? `${service.latency}ms` : '—'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">URL</span>
          <span className="text-gray-400 font-mono text-[10px]">{service.url}</span>
        </div>
        {service.details && (
          <div className="flex justify-between">
            <span className="text-gray-500">Uptime</span>
            <span className="text-gray-300">
              {service.details['data'] && typeof service.details['data'] === 'object' && 'uptime' in (service.details['data'] as Record<string, unknown>)
                ? formatUptime((service.details['data'] as Record<string, unknown>)['uptime'] as number)
                : '—'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

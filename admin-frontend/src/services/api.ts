const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Admin Auth
  login: (email: string, password: string) =>
    request<{ success: boolean; data: { adminId: string } }>('/api/admin/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  verifyOtp: (adminId: string, otp: string) =>
    request<{ success: boolean; data: { token: string; refreshToken: string } }>('/api/admin/verify-otp', {
      method: 'POST', body: JSON.stringify({ adminId, otp }),
    }),
  bootstrap: (name: string, email: string, password: string) =>
    request<{ success: boolean; data: { adminId: string; email: string; name: string } }>('/api/admin/bootstrap', {
      method: 'POST', body: JSON.stringify({ name, email, password }),
    }),

  // Admin User Management
  listAdmins: () =>
    request<{ success: boolean; data: { admins: AdminUser[] } }>('/api/admin/users'),
  createAdmin: (name: string, email: string, password: string) =>
    request<{ success: boolean; data: { adminId: string; email: string; name: string } }>('/api/admin/users', {
      method: 'POST', body: JSON.stringify({ name, email, password }),
    }),
  deleteAdmin: (adminId: string) =>
    request<{ success: boolean }>(`/api/admin/users/${adminId}`, { method: 'DELETE' }),

  // Recent RAIDs
  getRecentRaids: () =>
    request<{ success: boolean; data: { raids: RecentRaid[] } }>('/api/admin/recent-raids'),
  saveRecentRaid: (raid: string, label?: string) =>
    request<{ success: boolean }>('/api/admin/recent-raids', {
      method: 'POST', body: JSON.stringify({ raid, label }),
    }),

  // Logs
  getLogs: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ success: boolean; data: { logs: LogEntry[]; pagination: Pagination } }>(`/api/logs?${qs}`);
  },
  getRaidTrace: (raid: string) =>
    request<{ success: boolean; data: RaidTrace }>(`/api/logs/raid/${encodeURIComponent(raid)}`),
  getStats: (hours = 24) =>
    request<{ success: boolean; data: LogStats }>(`/api/logs/stats?hours=${hours}`),
  deleteLogs: (days = 30) =>
    request<{ success: boolean; data: { deleted: number } }>(`/api/logs?olderThanDays=${days}`, { method: 'DELETE' }),

  // Health
  getHealthAggregate: () =>
    request<HealthAggregate>('/gateway/health-aggregate'),

  // SSE stream URL builder
  getStreamUrl: () => {
    const token = sessionStorage.getItem('admin_token');
    return `${API_BASE}/api/logs/stream${token ? `?token=${token}` : ''}`;
  },
};

// ── Types ──

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isVerified: boolean;
  lastLogin?: string;
  failedLoginAttempts: number;
  lockUntil?: string;
  createdBy?: string;
  createdAt: string;
}

export interface RecentRaid {
  _id: string;
  adminUserId: string;
  raid: string;
  label: string;
  searchedAt: string;
}

export interface LogEntry {
  _id: string;
  service: string;
  level: string;
  message: string;
  timestamp: string;
  meta?: Record<string, unknown>;
  raid?: string;
  traceId?: string;
  userId?: string;
  statusCode?: number;
  responseTime?: number;
  path?: string;
  method?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface RaidTrace {
  raid: string;
  summary: {
    totalLogs: number;
    services: string[];
    serviceCount: number;
    totalDurationMs: number;
    hasErrors: boolean;
    startedAt: string;
    endedAt: string;
  };
  timeline: LogEntry[];
  byService: Record<string, LogEntry[]>;
}

export interface LogStats {
  period: string;
  totalLogs: number;
  errorCount: number;
  errorRate: string;
  byService: Record<string, number>;
  byLevel: Record<string, number>;
  sseClients: number;
}

export interface ServiceHealth {
  name: string;
  url: string;
  status: 'healthy' | 'unhealthy';
  latency?: number;
  details?: Record<string, unknown>;
}

export interface HealthAggregate {
  success: boolean;
  gateway: { status: string; uptime: number };
  services: ServiceHealth[];
}

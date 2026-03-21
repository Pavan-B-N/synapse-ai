import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/raid', label: 'RAID Trace', icon: '🔍' },
  { to: '/logs', label: 'Logs', icon: '📋' },
  { to: '/stream', label: 'Live Stream', icon: '📡' },
  { to: '/health', label: 'Health', icon: '💚' },
  { to: '/admins', label: 'Admin Users', icon: '🔒' },
];

interface Props { children: ReactNode; onLogout: () => void }

export default function Layout({ children, onLogout }: Props) {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-surface-light border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-accent">Synapse Admin</h1>
          <p className="text-xs text-gray-500 mt-0.5">System Observability</p>
        </div>

        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent border-r-2 border-accent'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-lighter'
                }`
              }
            >
              <span>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={onLogout}
            className="w-full px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-surface p-6">
        {children}
      </main>
    </div>
  );
}

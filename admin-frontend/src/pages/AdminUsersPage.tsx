import { useState, useEffect } from 'react';
import { api, AdminUser } from '../services/api';

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchAdmins = async () => {
    try {
      const res = await api.listAdmins();
      setAdmins(res.data.admins);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load admins');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleDelete = async (adminId: string) => {
    try {
      await api.deleteAdmin(adminId);
      setAdmins(prev => prev.filter(a => a._id !== adminId));
      setDeleteConfirm(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete admin');
      setDeleteConfirm(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Admin Users</h2>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm mb-4">{error}</div>}

      {/* Admin List */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading admins...</div>
      ) : admins.length === 0 ? (
        <div className="p-6 bg-surface-light border border-gray-800 rounded-lg text-center">
          <p className="text-gray-400">No admin accounts found.</p>
        </div>
      ) : (
        <div className="bg-surface-light border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Last Login</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="text-left px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin._id} className="border-b border-gray-800/50 hover:bg-surface-lighter transition-colors">
                  <td className="px-4 py-3 text-gray-200 font-medium">{admin.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{admin.email}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-accent/20 text-accent">{admin.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {admin.lastLogin ? new Date(admin.lastLogin).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {admin.lockUntil && new Date(admin.lockUntil) > new Date() ? (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">Locked</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(admin.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {deleteConfirm === admin._id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDelete(admin._id)} className="text-xs text-red-400 hover:text-red-300 font-medium">Confirm</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(admin._id)} className="text-xs text-gray-500 hover:text-red-400 transition-colors">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Security Info */}
      <div className="mt-6 p-4 bg-surface-light border border-gray-800 rounded-lg">
        <h4 className="text-xs font-medium text-gray-400 mb-2">Admin Security Policy</h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>&#x2022; Passwords: minimum 12 characters with uppercase, lowercase, number, and special character</li>
          <li>&#x2022; OTP: 8-digit code, expires in 3 minutes</li>
          <li>&#x2022; Session: access token expires in 1 hour (vs 7 days for regular users)</li>
          <li>&#x2022; Account locks after 5 failed login attempts for 30 minutes</li>
          <li>&#x2022; Password hashing: 14 bcrypt rounds (vs 12 for regular users)</li>
        </ul>
      </div>
    </div>
  );
}

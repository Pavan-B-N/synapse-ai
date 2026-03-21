import { useState } from 'react';
import { api } from '../services/api';

interface Props { onLogin: () => void }

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [adminId, setAdminId] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setAdminId(res.data.adminId);
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.verifyOtp(adminId, otp);
      localStorage.setItem('admin_token', res.data.token);
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'OTP verification failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface-light border border-gray-800 rounded-lg p-8">
        <h1 className="text-2xl font-bold text-center text-accent mb-1">Synapse Admin</h1>
        <p className="text-gray-500 text-center text-sm mb-6">System Observability Panel</p>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{error}</div>}

        {step === 'credentials' && (
          <>
            <form onSubmit={handleLogin}>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                className="w-full mb-4 px-3 py-2 bg-surface border border-gray-700 rounded text-gray-100 text-sm focus:outline-none focus:border-accent" />
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                className="w-full mb-6 px-3 py-2 bg-surface border border-gray-700 rounded text-gray-100 text-sm focus:outline-none focus:border-accent" />
              <button disabled={loading} type="submit"
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtp}>
            <p className="text-gray-400 text-sm mb-4">8-digit OTP sent to <span className="text-gray-200">{email}</span></p>
            <label className="block text-sm text-gray-400 mb-1">OTP Code</label>
            <input type="text" required maxLength={8} value={otp} onChange={e => setOtp(e.target.value)}
              className="w-full mb-6 px-3 py-2 bg-surface border border-gray-700 rounded text-gray-100 text-sm text-center tracking-widest focus:outline-none focus:border-accent" />
            <button disabled={loading} type="submit"
              className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded text-sm font-medium transition-colors disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

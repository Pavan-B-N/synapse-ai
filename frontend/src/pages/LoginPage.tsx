import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Brain, Eye, EyeOff, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [pendingUserId, setPendingUserId] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { login, register, verifyOtp, resendOtp } = useAuth();
  const navigate = useNavigate();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = isRegister
        ? await register(name, email, password)
        : await login(email, password);

      if (result?.requiresOTP) {
        setPendingUserId(result.userId);
        setPendingEmail(result.email);
        setOtpStep(true);
        setResendCooldown(30);
        toast.success('OTP sent to your email!');
      } else {
        toast.success(isRegister ? 'Account created!' : 'Welcome back!');
        navigate('/');
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otpDigits];
    next[index] = value.slice(-1);
    setOtpDigits(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...otpDigits];
    for (let i = 0; i < 6; i++) next[i] = pasted[i] || '';
    setOtpDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleVerifyOtp = async () => {
    const otp = otpDigits.join('');
    if (otp.length !== 6) { toast.error('Please enter the 6-digit OTP'); return; }
    setLoading(true);
    try {
      await verifyOtp(pendingUserId, otp);
      toast.success('Verified! Welcome!');
      navigate('/');
    } catch (error) {
      toast.error(error.message);
      setOtpDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      await resendOtp(pendingUserId);
      setResendCooldown(30);
      setOtpDigits(['', '', '', '', '', '']);
      toast.success('New OTP sent!');
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleBackToLogin = () => {
    setOtpStep(false);
    setPendingUserId('');
    setPendingEmail('');
    setOtpDigits(['', '', '', '', '', '']);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <Brain size={28} />
            </div>
            <h1 className="auth-logo-title">Synapse AI</h1>
            <p className="auth-logo-subtitle">AI-Powered Knowledge Workspace</p>
          </div>

          {otpStep ? (
            /* ───── OTP Verification Step ───── */
            <div className="auth-form">
              <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Enter the 6-digit code sent to
                </p>
                <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{pendingEmail}</p>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    className="form-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    autoFocus={i === 0}
                    style={{
                      width: '44px',
                      height: '52px',
                      textAlign: 'center',
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              <button
                className="btn btn-primary btn-lg"
                disabled={loading || otpDigits.join('').length !== 6}
                onClick={handleVerifyOtp}
                style={{ width: '100%' }}
              >
                {loading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : 'Verify OTP'}
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-3)' }}>
                <button
                  className="btn btn-ghost"
                  onClick={handleBackToLogin}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}
                >
                  <ArrowLeft size={14} /> Back
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}
                >
                  <RefreshCw size={14} />
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </div>
          ) : (
            /* ───── Login / Register Form ───── */
            <>
              <form className="auth-form" onSubmit={handleSubmit}>
                {isRegister && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-name">Full Name</label>
                    <input
                      id="auth-name"
                      className="form-input"
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="auth-email">Email Address</label>
                  <input
                    id="auth-email"
                    className="form-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="auth-password">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="auth-password"
                      className="form-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}
                >
                  {loading ? (
                    <div className="spinner" style={{ width: 20, height: 20 }} />
                  ) : isRegister ? (
                    'Create Account'
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <div className="auth-toggle">
                {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
                <a onClick={() => setIsRegister(!isRegister)}>
                  {isRegister ? 'Sign In' : 'Register'}
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

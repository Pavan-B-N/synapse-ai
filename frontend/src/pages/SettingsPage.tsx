import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Volume2, Settings, User, Trash2, Loader2, Edit3, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

type VoiceGender = 'all' | 'male' | 'female';

const guessGender = (voice: SpeechSynthesisVoice): VoiceGender => {
  const n = voice.name.toLowerCase();
  if (/\b(female|woman|zira|hazel|susan|linda|karen|samantha|fiona|moira|tessa|ellen)\b/.test(n)) return 'female';
  if (/\b(male|man|david|mark|james|daniel|george|richard|thomas|alex|rishi|sean)\b/.test(n)) return 'male';
  if (/\b(jenny|aria|sara|sonia|heera|priya|neerja|swara|sapna|shruti|emily|amy|joanna|ivy|kendra|kimberly|salli|celine|lea|vicki|lotte|lucia|bianca|camila|vitoria|penelope|lupe|mia|ines|zeina)\b/.test(n)) return 'female';
  if (/\b(guy|ryan|matthew|joey|justin|brian|geraint|enrique|miguel|liam|cristiano|giorgio|takumi|zhiyu|karl|filip|jacek|jan|pedro|pavan)\b/.test(n)) return 'male';
  return 'all';
};

export default function SettingsPage() {
  const { user, logout } = useAuth() as any;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speechRate, setSpeechRate] = useState(1);
  const [genderFilter, setGenderFilter] = useState<VoiceGender>('all');

  // Edit username
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      const saved = localStorage.getItem('synapse_tts_voice');
      const savedRate = localStorage.getItem('synapse_tts_rate');
      if (saved) setSelectedVoice(saved);
      if (savedRate) setSpeechRate(parseFloat(savedRate));
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const filteredVoices = voices.filter(v => {
    // Only show English language voices
    if (!v.lang.startsWith('en')) return false;
    if (genderFilter === 'all') return true;
    const g = guessGender(v);
    return g === genderFilter;
  });

  const saveVoiceSettings = () => {
    localStorage.setItem('synapse_tts_voice', selectedVoice);
    localStorage.setItem('synapse_tts_rate', String(speechRate));
    toast.success('Voice settings saved');
  };

  const previewVoice = () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('Hello! This is a preview of the selected voice.');
    utterance.rate = speechRate;
    if (selectedVoice) {
      const voice = voices.find(v => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  };

  const handleSaveName = async () => {
    if (!newName.trim() || savingName) return;
    setSavingName(true);
    try {
      await authAPI.updateProfile({ name: newName.trim() });
      toast.success('Name updated');
      setEditingName(false);
      window.location.reload();
    } catch {
      toast.error('Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE' || deleting) return;
    setDeleting(true);
    try {
      await authAPI.deleteAccount();
      toast.success('Account deleted');
      logout();
    } catch {
      toast.error('Failed to delete account');
      setDeleting(false);
    }
  };

  const radioStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border)'}`,
    background: active ? 'rgba(124,58,237,0.1)' : 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Settings</h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
        Manage your preferences and account settings.
      </p>

      {/* Profile Section */}
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <User size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Profile</h3>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Name</div>
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  maxLength={50}
                  style={{
                    padding: '4px 10px', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                    background: '#1a1a2e', border: '1px solid var(--accent-primary)', borderRadius: 8,
                    color: 'var(--text-primary)', outline: 'none', width: 180,
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                />
                <button onClick={handleSaveName} disabled={savingName || !newName.trim()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: 4 }}>
                  {savingName ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                </button>
                <button onClick={() => setEditingName(false)} disabled={savingName}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name || 'User'}</span>
                <button onClick={() => { setNewName(user?.name || ''); setEditingName(true); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                  <Edit3 size={14} />
                </button>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Email</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.email || ''}</div>
          </div>
        </div>
      </div>

      {/* Voice Settings */}
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Volume2 size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Voice & Speech</h3>
        </div>

        {/* Gender filter radio buttons */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Voice Type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={radioStyle(genderFilter === 'all')} onClick={() => { setGenderFilter('all'); setSelectedVoice(''); }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${genderFilter === 'all' ? 'var(--accent-primary)' : 'var(--text-muted)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {genderFilter === 'all' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-primary)' }} />}
              </span>
              All
            </button>
            <button style={radioStyle(genderFilter === 'male')} onClick={() => { setGenderFilter('male'); setSelectedVoice(''); }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${genderFilter === 'male' ? 'var(--accent-primary)' : 'var(--text-muted)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {genderFilter === 'male' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-primary)' }} />}
              </span>
              Male
            </button>
            <button style={radioStyle(genderFilter === 'female')} onClick={() => { setGenderFilter('female'); setSelectedVoice(''); }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${genderFilter === 'female' ? 'var(--accent-primary)' : 'var(--text-muted)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {genderFilter === 'female' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-primary)' }} />}
              </span>
              Female
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>TTS Voice</label>
          <select
            value={selectedVoice}
            onChange={e => setSelectedVoice(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', background: '#1a1a2e',
              border: '1px solid var(--border)', borderRadius: 10, color: '#e2e2ee',
              fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
          >
            <option value="" style={{ background: '#1a1a2e', color: '#e2e2ee' }}>System default</option>
            {filteredVoices.map(v => (
              <option key={v.name} value={v.name} style={{ background: '#1a1a2e', color: '#e2e2ee' }}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Speech Rate: {speechRate.toFixed(1)}x
          </label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speechRate}
            onChange={e => setSpeechRate(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={saveVoiceSettings}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings size={14} /> Save
          </button>
          <button className="btn" onClick={previewVoice}
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Volume2 size={14} /> Preview
          </button>
        </div>
      </div>

      {/* App Info */}
      <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Settings size={18} style={{ color: 'var(--accent-primary)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>About</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong>Synapse AI</strong> — Intelligent document analysis platform.
          <br />Upload documents, chat with AI, generate reports, and test your knowledge with quizzes.
        </p>
      </div>

      {/* Danger Zone */}
      <div style={{ background: 'var(--surface-1)', border: '1px solid #dc262620', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Trash2 size={18} style={{ color: '#dc2626' }} />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#dc2626' }}>Danger Zone</h3>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Permanently delete your account and all associated data including documents, embeddings, conversations, and files. This action cannot be undone.
        </p>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid #dc2626',
            background: 'rgba(220,38,38,0.1)', color: '#dc2626',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Trash2 size={14} /> Delete Account
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, maxWidth: 420, width: '90%' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#dc2626', marginBottom: 12 }}>Delete Account</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              This will permanently delete your account and <strong>all</strong> your data: documents, embeddings, conversations, quiz history, channel memberships, and uploaded files. This action is <strong>irreversible</strong>.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              autoFocus
              style={{
                width: '100%', padding: '10px 14px', background: '#1a1a2e',
                border: '1px solid var(--border)', borderRadius: 10, color: '#e2e2ee',
                fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 20,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                disabled={deleting}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: deleteConfirmText === 'DELETE' ? '#dc2626' : '#dc262640',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {deleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                {deleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

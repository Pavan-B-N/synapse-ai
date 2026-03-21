import React, { useState } from 'react';
import { X, ExternalLink } from 'lucide-react';

/**
 * Custom link renderer for ReactMarkdown that shows a confirmation dialog
 * before navigating to external websites.
 */
export function ExternalLinkRenderer({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [showModal, setShowModal] = useState(false);

  const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));

  const handleClick = (e: React.MouseEvent) => {
    if (isExternal) {
      e.preventDefault();
      setShowModal(true);
    }
  };

  const confirmNavigate = () => {
    setShowModal(false);
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <a
        href={href}
        onClick={handleClick}
        style={{ color: 'var(--accent-primary)', textDecoration: 'underline', cursor: 'pointer' }}
        {...props}
      >
        {children}
        {isExternal && <ExternalLink size={11} style={{ marginLeft: 3, verticalAlign: -1 }} />}
      </a>
      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-content" style={{ maxWidth: 440, width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                <ExternalLink size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                External Link
              </h3>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 30, height: 30 }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
              You are about to leave Synapse AI and visit an external website:
            </p>
            <div style={{
              padding: '10px 14px', background: 'var(--surface-1)', borderRadius: 8,
              border: '1px solid var(--border)', marginBottom: 16, wordBreak: 'break-all',
              fontSize: 13, color: 'var(--text-muted)',
            }}>
              {href}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
              Synapse AI is not responsible for the content of external sites. Continue only if you trust this link.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setShowModal(false)}
                style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmNavigate}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ExternalLink size={14} />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Pass this to ReactMarkdown's `components` prop */
export const markdownLinkComponents = {
  a: ExternalLinkRenderer as any,
};

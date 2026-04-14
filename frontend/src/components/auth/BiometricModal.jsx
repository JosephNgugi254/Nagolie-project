/**
 * BiometricModal.jsx  –  Fixed for Nagolie Enterprises
 *
 * Key fixes vs original:
 *  1. Sends cacheKey (returned by /begin) back to /complete so the server can
 *     retrieve the challenge without relying on flask_session.
 *  2. The `id` fields in allowCredentials are already Base64URL strings from
 *     the server – passed through as-is; SimpleWebAuthn decodes them internally.
 *  3. Correct option shapes for startAuthentication (rpId, not rp.id, etc.).
 *  4. Graceful error messages surfaced to the user.
 */

import { useState, useEffect } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import Modal from '../common/Modal';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : 'https://nagolie-backend.onrender.com/api');

const authFetch = (url, opts = {}) => {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
};

export default function BiometricModal({ isOpen, onClose, onUsePassword, onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (isOpen) {
      const last = localStorage.getItem('last_biometric_username');
      if (last) setUsername(last);
    }
  }, [isOpen]);

  // -------------------------------------------------------------------------
  const handleBiometricLogin = async () => {
    const trimmed = username.trim();
    if (!trimmed) { setError('Please enter your username'); return; }

    setLoading(true);
    setError('');

    try {
      /* ── Step 1: get challenge + options ── */
      const beginRes = await fetch(`${API_BASE}/auth/biometric/login/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      });

      if (!beginRes.ok) {
        const txt = await beginRes.text();
        let msg = 'Failed to start authentication';
        try { msg = JSON.parse(txt).error || msg; } catch (_) { /* raw text */ }
        throw new Error(msg);
      }

      const beginData = await beginRes.json();
      const { cacheKey, options } = beginData;

      /* ── Step 2: invoke device biometric ── */
      // startAuthentication expects a PublicKeyCredentialRequestOptionsJSON shape
      const asseResp = await startAuthentication(options);

      /* ── Step 3: send result + cacheKey to server ── */
      const verifyRes = await fetch(`${API_BASE}/auth/biometric/login/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...asseResp, cacheKey }),
      });

      if (!verifyRes.ok) {
        const txt = await verifyRes.text();
        let msg = 'Biometric verification failed';
        try { msg = JSON.parse(txt).error || msg; } catch (_) { /* raw text */ }
        throw new Error(msg);
      }

      const verifyData = await verifyRes.json();

      /* ── Step 4: persist tokens & navigate ── */
      localStorage.setItem('token',     verifyData.access_token);
      localStorage.setItem('user',      JSON.stringify(verifyData.user));
      localStorage.setItem('user_role', verifyData.user.role);
      localStorage.setItem('last_biometric_username', trimmed);

      if (verifyData.user.role === 'admin') {
        localStorage.setItem('admin_token', verifyData.access_token);
        localStorage.setItem('admin_user',  JSON.stringify(verifyData.user));
      } else if (verifyData.user.role === 'investor') {
        localStorage.setItem('investor_token', verifyData.access_token);
        localStorage.setItem('investor_user',  JSON.stringify(verifyData.user));
      }

      onLoginSuccess(verifyData.user, verifyData.redirect_to);
    } catch (err) {
      // SimpleWebAuthn throws a readable Error on user cancellation, timeout, etc.
      setError(err.message || 'Biometric authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Login with Biometrics" size="md">
      <div className="text-center mb-4">
        <i className="fas fa-fingerprint fa-4x text-primary mb-3" style={{ display: 'block' }} />
        <p className="text-muted mb-0">
          Use your fingerprint or Face ID to log in instantly
        </p>
      </div>

      <div className="mb-3">
        <label className="form-label fw-semibold">Username</label>
        <input
          type="text"
          className="form-control form-control-lg"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => { setUsername(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && handleBiometricLogin()}
          autoFocus
          autoComplete="username"
        />
      </div>

      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2 py-2">
          <i className="fas fa-exclamation-circle" />
          <span>{error}</span>
        </div>
      )}

      <div className="d-flex gap-2 mt-3">
        <button
          className="btn btn-primary flex-fill py-2"
          onClick={handleBiometricLogin}
          disabled={loading}
        >
          {loading ? (
            <><span className="spinner-border spinner-border-sm me-2" />Verifying…</>
          ) : (
            <><i className="fas fa-fingerprint me-2" />Use Biometrics</>
          )}
        </button>
        <button
          className="btn btn-outline-secondary flex-fill py-2"
          onClick={() => { onUsePassword(); onClose(); }}
          disabled={loading}
        >
          <i className="fas fa-key me-2" />Use Password
        </button>
      </div>
    </Modal>
  );
}
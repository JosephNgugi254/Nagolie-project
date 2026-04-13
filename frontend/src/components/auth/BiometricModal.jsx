import { useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import Modal from '../common/Modal';

export default function BiometricModal({ isOpen, onClose, onUsePassword, onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBiometricLogin = async () => {
    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }
    setLoading(true);
    setError('');

    try {
      // Step 1: Get authentication options from backend
      const optionsRes = await fetch('/api/auth/biometric/login/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });
      const optionsData = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsData.error || 'Failed to start authentication');

      // Step 2: Call WebAuthn to get credential
      const asseResp = await startAuthentication(optionsData.options);

      // Step 3: Verify assertion with backend
      const verifyRes = await fetch('/api/auth/biometric/login/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(asseResp)
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || 'Biometric verification failed');

      // Step 4: Login success – store token and user
      localStorage.setItem('token', verifyData.access_token);
      localStorage.setItem('user', JSON.stringify(verifyData.user));
      localStorage.setItem('user_role', verifyData.user.role);
      if (verifyData.user.role === 'admin') {
        localStorage.setItem('admin_token', verifyData.access_token);
        localStorage.setItem('admin_user', JSON.stringify(verifyData.user));
      } else if (verifyData.user.role === 'investor') {
        localStorage.setItem('investor_token', verifyData.access_token);
        localStorage.setItem('investor_user', JSON.stringify(verifyData.user));
      }
      onLoginSuccess(verifyData.user, verifyData.redirect_to);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUsePassword = () => {
    onUsePassword();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Login with Biometrics" size="md">
      <div className="text-center mb-4">
        <i className="fas fa-fingerprint fa-4x text-primary mb-3"></i>
        <p className="text-muted">Use your fingerprint or face unlock to log in instantly</p>
      </div>

      <div className="mb-3">
        <label className="form-label">Username</label>
        <input
          type="text"
          className="form-control"
          placeholder="Enter your username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="d-flex gap-2">
        <button
          className="btn btn-primary flex-fill"
          onClick={handleBiometricLogin}
          disabled={loading}
        >
          {loading ? (
            <><span className="spinner-border spinner-border-sm me-2"></span>Verifying...</>
          ) : (
            <><i className="fas fa-fingerprint me-2"></i>Use Biometrics</>
          )}
        </button>
        <button
          className="btn btn-outline-secondary flex-fill"
          onClick={handleUsePassword}
        >
          <i className="fas fa-key me-2"></i>Use Password
        </button>
      </div>

      <div className="mt-3 text-center">
        <small className="text-muted">
          Biometrics are stored locally on your device and never shared.
        </small>
      </div>
    </Modal>
  );
}
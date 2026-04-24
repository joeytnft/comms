import React, { FormEvent, useState } from 'react';
import { apiFetch, setTokens } from '../api/client';
import { AuthTokens, User } from '../types';

interface Props {
  onLogin: (user: User) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiFetch<{ user: User; tokens: AuthTokens }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (data.user.role !== 'owner' && data.user.role !== 'admin') {
        setError('Admin access required. Only org owners and admins can use this panel.');
        return;
      }

      setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      onLogin(data.user);
    } catch (err) {
      setError((err as Error).message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoText}>GatherSafe</span>
          <span style={styles.logoBadge}>Admin</span>
        </div>
        <h1 style={styles.title}>Sign in</h1>
        <p style={styles.subtitle}>Geofence management panel</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            style={styles.input}
            autoFocus
          />
          <label style={styles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            style={styles.input}
          />

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f1117',
    padding: '24px',
  },
  card: {
    background: '#1a1d27',
    borderRadius: '12px',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
    border: '1px solid #2d3148',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  logoText: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  logoBadge: {
    background: '#3b82f6',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '100px',
    letterSpacing: '0.05em',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#f1f5f9',
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#64748b',
    marginBottom: '28px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: '-4px',
  },
  input: {
    background: '#0f1117',
    border: '1px solid #2d3148',
    borderRadius: '8px',
    padding: '12px 14px',
    color: '#f1f5f9',
    fontSize: '14px',
    outline: 'none',
  },
  error: {
    background: '#7f1d1d30',
    border: '1px solid #ef4444',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#fca5a5',
    fontSize: '13px',
  },
  button: {
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '13px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '4px',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

import { useState } from 'react';
import { api, setToken } from '../api.js';
import { getInitData } from '../telegram.js';
import { Button, Card, ErrorText, Input } from '../components/ui.jsx';

export default function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/login', {
        method: 'POST',
        body: { login, password, init_data: getInitData() || undefined },
      });
      setToken(r.token);
      onLogin(r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="logo">NEURON</div>
      <p className="muted tagline">Bilim sari yo‘l</p>
      <Card className="login-card">
        <form onSubmit={submit} className="stack">
          <Input placeholder="Login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          <Input
            type="password"
            placeholder="Parol"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || !login || !password}>
            {busy ? 'Kirilmoqda…' : 'Kirish'}
          </Button>
        </form>
      </Card>
      <p className="muted small-text">Login va parolni markaz administratoridan oling.</p>
    </div>
  );
}

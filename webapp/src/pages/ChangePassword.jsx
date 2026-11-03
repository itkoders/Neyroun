import { useState } from 'react';
import { api } from '../api.js';
import { Button, Card, ErrorText, Input } from '../components/ui.jsx';

export default function ChangePassword({ user, onDone }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== repeat) return setError('Yangi parollar bir xil emas');
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword },
      });
      onDone({ ...user, must_change_password: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="logo">NEURON</div>
      <Card className="login-card">
        <h3>Parolni almashtiring</h3>
        <p className="muted">Xavfsizlik uchun vaqtinchalik parolni o‘zgartirish kerak.</p>
        <form onSubmit={submit} className="stack">
          <Input type="password" placeholder="Vaqtinchalik parol" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} />
          <Input type="password" placeholder="Yangi parol (kamida 8 belgi)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <Input type="password" placeholder="Yangi parolni takrorlang" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          <ErrorText error={error} />
          <Button type="submit" disabled={busy || newPassword.length < 8}>
            Saqlash
          </Button>
        </form>
      </Card>
    </div>
  );
}

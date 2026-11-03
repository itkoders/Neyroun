import { useState } from 'react';
import { api } from '../api.js';
import Notifications from '../components/Notifications.jsx';
import {
  Button, Card, Chip, Empty, ErrorText, Input, Select, Tabs, useFetch,
} from '../components/ui.jsx';

const TABS = [
  { id: 'accounts', label: 'Hisoblar' },
  { id: 'links', label: 'So‘rovlar' },
  { id: 'notes', label: 'Xabarlar' },
];

export default function AdminHome() {
  const [tab, setTab] = useState('accounts');
  return (
    <main className="page">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'accounts' && <Accounts />}
      {tab === 'links' && <LinkRequests />}
      {tab === 'notes' && <Notifications />}
    </main>
  );
}

function Accounts() {
  const [role, setRole] = useState('teacher');
  const [form, setForm] = useState({ login: '', full_name: '', phone: '' });
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const list = useFetch(`/admin/accounts?role=${role}`);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setCreated(null);
    try {
      const r = await api('/admin/accounts', { method: 'POST', body: { role, ...form } });
      setCreated({ login: r.account.login, password: r.temporary_password });
      setForm({ login: '', full_name: '', phone: '' });
      list.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggle = async (acc) => {
    await api(`/admin/accounts/${acc.id}`, { method: 'PATCH', body: { is_active: !acc.is_active } });
    list.reload();
  };

  const resetPassword = async (acc) => {
    const r = await api(`/admin/accounts/${acc.id}/reset-password`, { method: 'POST' });
    setCreated({ login: acc.login, password: r.temporary_password });
  };

  return (
    <div className="stack">
      <Card className="fade-up">
        <h3>Yangi hisob</h3>
        <div className="row">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="teacher">O‘qituvchi</option>
            <option value="parent">Ota-ona</option>
          </Select>
        </div>
        <form onSubmit={create} className="stack">
          <Input placeholder="Ism familiya" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input placeholder="Login" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} />
          <Input placeholder="Telefon (ixtiyoriy)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <ErrorText error={error} />
          <Button type="submit" disabled={!form.login || !form.full_name}>
            Yaratish
          </Button>
        </form>
        {created && (
          <div className="credentials fade-up">
            <p>Vaqtinchalik ma‘lumotlar (faqat bir marta ko‘rsatiladi):</p>
            <code>
              Login: {created.login}
              <br />
              Parol: {created.password}
            </code>
          </div>
        )}
      </Card>

      <Card className="fade-up">
        <h3>{role === 'teacher' ? 'O‘qituvchilar' : 'Ota-onalar'}</h3>
        {list.data && !list.data.accounts.length && <Empty>Hisoblar yo‘q</Empty>}
        {list.data?.accounts.map((a) => (
          <div key={a.id} className="grade-item">
            <div>
              <strong>{a.full_name}</strong>
              <div className="muted small-text">{a.login}</div>
            </div>
            <div className="row">
              <Chip tone={a.is_active ? 'good' : 'bad'}>{a.is_active ? 'Faol' : 'O‘chiq'}</Chip>
              <Button variant="ghost" onClick={() => resetPassword(a)}>
                Parol
              </Button>
              <Button variant="ghost" onClick={() => toggle(a)}>
                {a.is_active ? 'O‘chirish' : 'Yoqish'}
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function LinkRequests() {
  const { data, error, reload } = useFetch('/admin/link-requests?status=pending');
  const [actionError, setActionError] = useState('');

  const decide = async (id, approve) => {
    setActionError('');
    try {
      await api(`/admin/link-requests/${id}/decide`, { method: 'POST', body: { approve } });
      reload();
    } catch (e) {
      setActionError(e.message);
    }
  };

  return (
    <Card className="fade-up">
      <h3>Ota-ona so‘rovlari</h3>
      <ErrorText error={error || actionError} />
      {data && !data.requests.length && <Empty>Kutilayotgan so‘rov yo‘q</Empty>}
      {data?.requests.map((r) => (
        <div key={r.id} className="grade-item">
          <div>
            <strong>{r.parent_name}</strong>
            <div className="muted small-text">
              → {r.student_name} {r.group_name ? `· ${r.group_name}` : ''}
            </div>
          </div>
          <div className="row">
            <Button onClick={() => decide(r.id, true)}>Tasdiqlash</Button>
            <Button variant="ghost" onClick={() => decide(r.id, false)}>
              Rad etish
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}

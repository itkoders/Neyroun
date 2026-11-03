import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Leaderboard from '../components/Leaderboard.jsx';
import Notifications from '../components/Notifications.jsx';
import { SubjectLines } from '../components/Charts.jsx';
import {
  Button, Card, Chip, Empty, ErrorText, Input, Select, Tabs, currentMonth, formatSum,
  scoreTone, useFetch,
} from '../components/ui.jsx';

const TABS = [
  { id: 'journal', label: 'Jurnal' },
  { id: 'chart', label: 'Diagramma' },
  { id: 'payments', label: 'To‘lovlar' },
  { id: 'add', label: 'Farzand' },
  { id: 'rank', label: 'Reyting' },
  { id: 'notes', label: 'Xabarlar' },
];

export default function ParentHome() {
  const [tab, setTab] = useState('journal');
  const children = useFetch('/parent/children');
  const [childId, setChildId] = useState('');

  useEffect(() => {
    if (!childId && children.data?.children?.length) setChildId(children.data.children[0].id);
  }, [children.data, childId]);

  const hasChildren = children.data?.children?.length > 0;
  const needsChild = ['journal', 'chart', 'payments'].includes(tab);

  return (
    <main className="page">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {needsChild && !hasChildren && (
        <Empty>Hali tasdiqlangan farzand yo‘q. “Farzand” bo‘limidan so‘rov yuboring.</Empty>
      )}

      {needsChild && hasChildren && (
        <Select value={childId} onChange={(e) => setChildId(e.target.value)} className="child-select">
          {children.data.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name} {c.group_name ? `· ${c.group_name}` : ''}
            </option>
          ))}
        </Select>
      )}

      {tab === 'journal' && childId && <ChildJournal childId={childId} />}
      {tab === 'chart' && childId && <ChildChart childId={childId} />}
      {tab === 'payments' && childId && <ChildPayments childId={childId} />}
      {tab === 'add' && <AddChild />}
      {tab === 'rank' && <Leaderboard />}
      {tab === 'notes' && <Notifications />}
    </main>
  );
}

function ChildJournal({ childId }) {
  const [month, setMonth] = useState(currentMonth());
  const { data, error } = useFetch(`/parent/children/${childId}/journal?month=${month}`);

  return (
    <Card className="fade-up">
      <div className="row between">
        <h3>Baholar</h3>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <ErrorText error={error} />
      {data && !data.grades.length && <Empty>Bu oy uchun baholar yo‘q</Empty>}
      <div className="grade-list">
        {data?.grades.map((g) => (
          <div key={g.id} className="grade-item">
            <div>
              <strong>{g.subject}</strong>
              <small className="muted"> · {g.lesson_date}</small>
              {g.comment && <div className="muted small-text">{g.comment}</div>}
            </div>
            <Chip tone={scoreTone(g.score)}>{g.score}</Chip>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChildChart({ childId }) {
  const { data, error } = useFetch(`/parent/children/${childId}/monthly`);
  return (
    <Card className="fade-up">
      <h3>Fanlar bo‘yicha dinamika</h3>
      <ErrorText error={error} />
      {data && !data.series.length && <Empty>Hali ma‘lumot yo‘q</Empty>}
      {data && <SubjectLines series={data.series} />}
    </Card>
  );
}

function ChildPayments({ childId }) {
  const { data, error } = useFetch(`/parent/children/${childId}/payments`);
  const statusTone = { paid: 'good', unpaid: 'neutral', overdue: 'bad' };
  const statusLabel = { paid: 'To‘langan', unpaid: 'Kutilmoqda', overdue: 'Muddati o‘tgan' };

  return (
    <Card className="fade-up">
      <h3>To‘lovlar</h3>
      <ErrorText error={error} />
      {data && !data.payments.length && <Empty>To‘lov yozuvlari yo‘q</Empty>}
      {data?.payments.map((p) => (
        <div key={p.id} className="grade-item">
          <div>
            <strong>{p.period_month.slice(0, 7)}</strong>
            <div className="muted small-text">
              {formatSum(p.amount_due)}
              {p.penalty > 0 && <> · jarima {formatSum(p.penalty)}</>}
            </div>
          </div>
          <Chip tone={statusTone[p.status]}>{statusLabel[p.status]}</Chip>
        </div>
      ))}
    </Card>
  );
}

function AddChild() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const search = async () => {
    setError('');
    setMessage('');
    try {
      const r = await api(`/parent/students/search?q=${encodeURIComponent(q)}`);
      setResults(r.students);
    } catch (e) {
      setError(e.message);
    }
  };

  const request = async (studentId) => {
    setError('');
    setMessage('');
    try {
      await api('/parent/links', { method: 'POST', body: { student_id: studentId } });
      setMessage('So‘rov yuborildi. Admin tasdiqlagach farzand ko‘rinadi.');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Card className="fade-up">
      <h3>Farzandni qo‘shish</h3>
      <div className="row">
        <Input placeholder="Ism bo‘yicha qidiring" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={search} disabled={!q.trim()}>
          Qidirish
        </Button>
      </div>
      <ErrorText error={error} />
      {message && <p className="success">{message}</p>}
      <div className="stack">
        {results.map((s) => (
          <div key={s.id} className="grade-item">
            <div>
              <strong>{s.full_name}</strong>
              <div className="muted small-text">{s.group_name}</div>
            </div>
            <Button variant="ghost" onClick={() => request(s.id)}>
              So‘rov
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

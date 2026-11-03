import { useState } from 'react';
import { api } from '../../api.js';
import { Button, Card, Chip, Empty, ErrorText, Input, currentMonth, formatSum, useFetch } from '../../components/ui.jsx';

const STATUS = {
  paid: { tone: 'good', label: 'To‘langan' },
  unpaid: { tone: 'neutral', label: 'Kutilmoqda' },
  overdue: { tone: 'bad', label: 'Muddati o‘tgan' },
};

export default function PaymentsTab() {
  const [month, setMonth] = useState(currentMonth());
  const payments = useFetch(`/teacher/payments?month=${month}`);
  const plans = useFetch('/teacher/payment-plans');
  const students = useFetch('/teacher/students');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [penaltyDraft, setPenaltyDraft] = useState({});
  const [plan, setPlan] = useState({ student_id: '', monthly_amount: '', due_day: '10', penalty_amount: '0' });

  const run = async (fn, okText) => {
    setError('');
    setMessage('');
    try {
      await fn();
      if (okText) setMessage(okText);
      payments.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const generate = () =>
    run(async () => {
      const r = await api('/teacher/payments/generate', { method: 'POST', body: { month } });
      setMessage(`${r.created} ta yangi to‘lov yaratildi`);
    });

  const markPaid = (id) => run(() => api(`/teacher/payments/${id}/mark-paid`, { method: 'POST', body: {} }), 'Naqd to‘lov qayd etildi');

  const setPenalty = (id) => {
    const penalty = Number(penaltyDraft[id]);
    if (!Number.isFinite(penalty) || penalty < 0) return setError('Jarima summasini kiriting');
    return run(() => api(`/teacher/payments/${id}/penalty`, { method: 'POST', body: { penalty } }), 'Jarima qo‘yildi, ota-onaga xabar yuborildi');
  };

  const savePlan = (e) => {
    e.preventDefault();
    run(
      () =>
        api('/teacher/payment-plans', {
          method: 'POST',
          body: {
            student_id: plan.student_id,
            monthly_amount: Number(plan.monthly_amount),
            due_day: Number(plan.due_day),
            penalty_amount: Number(plan.penalty_amount),
          },
        }).then(() => plans.reload()),
      'Oylik to‘lov saqlandi'
    );
  };

  return (
    <div className="stack">
      <Card className="fade-up">
        <h3>Oylik to‘lov rejasi</h3>
        <form onSubmit={savePlan} className="stack">
          <select className="input" value={plan.student_id} onChange={(e) => setPlan({ ...plan, student_id: e.target.value })}>
            <option value="">O‘quvchini tanlang</option>
            {students.data?.students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
          <div className="row wrap">
            <Input type="number" min="0" placeholder="Oylik summa" value={plan.monthly_amount} onChange={(e) => setPlan({ ...plan, monthly_amount: e.target.value })} />
            <Input type="number" min="1" max="28" placeholder="To‘lov kuni" value={plan.due_day} onChange={(e) => setPlan({ ...plan, due_day: e.target.value })} />
            <Input type="number" min="0" placeholder="Jarima (standart)" value={plan.penalty_amount} onChange={(e) => setPlan({ ...plan, penalty_amount: e.target.value })} />
          </div>
          <Button type="submit" disabled={!plan.student_id || !plan.monthly_amount}>Saqlash</Button>
        </form>
        {plans.data?.plans.length > 0 && (
          <div className="muted small-text">
            Rejalar: {plans.data.plans.length} ta o‘quvchi
          </div>
        )}
      </Card>

      <Card className="fade-up">
        <div className="row between wrap">
          <h3>To‘lovlar</h3>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={generate}>Shu oy uchun yaratish</Button>
        <ErrorText error={error || payments.error} />
        {message && <p className="success">{message}</p>}
        {payments.data && !payments.data.payments.length && <Empty>Bu oy uchun to‘lovlar yo‘q</Empty>}

        {payments.data?.payments.map((p) => (
          <div key={p.id} className="payment-item">
            <div className="row between">
              <div>
                <strong>{p.student_name}</strong>
                <div className="muted small-text">
                  {formatSum(p.amount_due)} · muddat {p.due_date}
                  {p.penalty > 0 && <> · jarima {formatSum(p.penalty)}</>}
                </div>
              </div>
              <Chip tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Chip>
            </div>
            {p.status !== 'paid' && (
              <div className="row wrap">
                <Button onClick={() => markPaid(p.id)}>To‘landi (naqd)</Button>
                <Input
                  type="number"
                  min="0"
                  placeholder="Jarima"
                  value={penaltyDraft[p.id] ?? ''}
                  onChange={(e) => setPenaltyDraft({ ...penaltyDraft, [p.id]: e.target.value })}
                />
                <Button variant="ghost" onClick={() => setPenalty(p.id)}>Jarima qo‘yish</Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

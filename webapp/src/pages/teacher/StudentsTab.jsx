import { useState } from 'react';
import { api } from '../../api.js';
import { Button, Card, Chip, Empty, ErrorText, Input, Select, useFetch } from '../../components/ui.jsx';

export default function StudentsTab() {
  const groups = useFetch('/teacher/groups');
  const [groupId, setGroupId] = useState('');
  const students = useFetch(groupId ? `/teacher/students?group_id=${groupId}` : null);
  const [form, setForm] = useState({ full_name: '', birth_date: '' });
  const [error, setError] = useState('');

  const add = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/teacher/students', {
        method: 'POST',
        body: { ...form, group_id: groupId, birth_date: form.birth_date || undefined },
      });
      setForm({ full_name: '', birth_date: '' });
      students.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const moveTo = async (studentId, newGroupId) => {
    setError('');
    try {
      await api(`/teacher/students/${studentId}`, { method: 'PATCH', body: { group_id: newGroupId } });
      students.reload();
    } catch (err) {
      setError(err.message);
    }
  };

  const deactivate = async (studentId) => {
    await api(`/teacher/students/${studentId}`, { method: 'PATCH', body: { is_active: false } });
    students.reload();
  };

  return (
    <div className="stack">
      <Card className="fade-up">
        <h3>O‘quvchilar</h3>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Guruhni tanlang</option>
          {groups.data?.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name} ({g.students_count})</option>
          ))}
        </Select>
      </Card>

      {groupId && (
        <Card className="fade-up">
          <form onSubmit={add} className="stack">
            <Input placeholder="O‘quvchi ismi" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            <Button type="submit" disabled={!form.full_name.trim()}>+ O‘quvchi qo‘shish</Button>
          </form>
        </Card>
      )}

      <ErrorText error={error || students.error} />
      {groupId && students.data && !students.data.students.length && <Empty>Bu guruhda o‘quvchi yo‘q</Empty>}

      {students.data?.students.map((s) => (
        <Card key={s.id} className="fade-up">
          <div className="row between">
            <strong>{s.full_name}</strong>
            <Chip tone="neutral">{s.group_name}</Chip>
          </div>
          <div className="row wrap">
            <Select value={s.group_id} onChange={(e) => moveTo(s.id, e.target.value)}>
              {groups.data?.groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
            <Button variant="ghost" onClick={() => deactivate(s.id)}>Faolsizlantirish</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { api } from '../../api.js';
import { Button, Card, Empty, ErrorText, Input, Select, useFetch } from '../../components/ui.jsx';

export default function SetupTab() {
  const groups = useFetch('/teacher/groups');
  const subjects = useFetch('/teacher/subjects');
  const assignments = useFetch('/teacher/assignments');
  const [groupName, setGroupName] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [assign, setAssign] = useState({ group_id: '', subject_id: '', weight: '1' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const run = async (fn, okText) => {
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(okText);
      groups.reload();
      subjects.reload();
      assignments.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="stack">
      <Card className="fade-up">
        <h3>Yangi guruh</h3>
        <div className="row">
          <Input placeholder="Guruh nomi" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <Button
            disabled={!groupName.trim()}
            onClick={() => run(() => api('/teacher/groups', { method: 'POST', body: { name: groupName } }).then(() => setGroupName('')), 'Guruh yaratildi')}
          >
            Qo‘shish
          </Button>
        </div>
      </Card>

      <Card className="fade-up">
        <h3>Yangi fan</h3>
        <div className="row">
          <Input placeholder="Fan nomi" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
          <Button
            disabled={!subjectName.trim()}
            onClick={() => run(() => api('/teacher/subjects', { method: 'POST', body: { name: subjectName } }).then(() => setSubjectName('')), 'Fan qo‘shildi')}
          >
            Qo‘shish
          </Button>
        </div>
      </Card>

      <Card className="fade-up">
        <h3>Fanni guruhga biriktirish</h3>
        <div className="stack">
          <Select value={assign.group_id} onChange={(e) => setAssign({ ...assign, group_id: e.target.value })}>
            <option value="">Guruh</option>
            {groups.data?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select value={assign.subject_id} onChange={(e) => setAssign({ ...assign, subject_id: e.target.value })}>
            <option value="">Fan</option>
            {subjects.data?.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Input type="number" step="0.1" min="0.1" max="10" placeholder="Og‘irlik" value={assign.weight} onChange={(e) => setAssign({ ...assign, weight: e.target.value })} />
          <Button
            disabled={!assign.group_id || !assign.subject_id}
            onClick={() =>
              run(
                () =>
                  api('/teacher/assignments', {
                    method: 'POST',
                    body: { group_id: assign.group_id, subject_id: assign.subject_id, weight: Number(assign.weight) },
                  }),
                'Biriktirildi'
              )
            }
          >
            Biriktirish
          </Button>
        </div>
      </Card>

      <ErrorText error={error || groups.error} />
      {message && <p className="success">{message}</p>}

      <Card className="fade-up">
        <h3>Mening biriktirmalarim</h3>
        {assignments.data && !assignments.data.assignments.length && <Empty>Hali biriktirma yo‘q</Empty>}
        {assignments.data?.assignments.map((a) => (
          <div key={`${a.group_id}-${a.subject_id}`} className="grade-item">
            <strong>{a.group_name}</strong>
            <span className="muted">{a.subject_name} · {a.weight}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { haptic } from '../../telegram.js';
import {
  Button, Card, Empty, ErrorText, Input, Select, currentMonth, today, useFetch,
} from '../../components/ui.jsx';

/**
 * Jurnal: qatorlar — o'quvchilar, ustunlar — dars sanalari.
 * Katakka ball yozib chiqilganda (blur) avtomatik saqlanadi.
 */
export default function JournalTab() {
  const groups = useFetch('/teacher/groups');
  const assignments = useFetch('/teacher/assignments');
  const [groupId, setGroupId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [extraDates, setExtraDates] = useState([]);
  const [newDate, setNewDate] = useState(today());
  const [error, setError] = useState('');

  const subjectsForGroup = useMemo(
    () => (assignments.data?.assignments || []).filter((a) => a.group_id === groupId),
    [assignments.data, groupId]
  );

  const journal = useFetch(
    groupId && subjectId ? `/teacher/journal?group_id=${groupId}&subject_id=${subjectId}&month=${month}` : null
  );

  const gradeMap = useMemo(() => {
    const m = new Map();
    journal.data?.grades.forEach((g) => m.set(`${g.student_id}|${g.lesson_date}`, g));
    return m;
  }, [journal.data]);

  const dates = useMemo(() => {
    const set = new Set(journal.data?.grades.map((g) => g.lesson_date) || []);
    extraDates.filter((d) => d.startsWith(month)).forEach((d) => set.add(d));
    return [...set].sort();
  }, [journal.data, extraDates, month]);

  const saveCell = async (studentId, date, value) => {
    setError('');
    const existing = gradeMap.get(`${studentId}|${date}`);
    if (value === '') return;
    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      return setError('Ball 0 dan 100 gacha butun son bo‘lishi kerak');
    }
    if (existing && existing.score === score) return;

    try {
      if (existing) {
        await api(`/teacher/grades/${existing.id}`, { method: 'PATCH', body: { score } });
      } else {
        await api('/teacher/grades', {
          method: 'POST',
          body: { student_id: studentId, subject_id: subjectId, score, lesson_date: date },
        });
      }
      haptic('medium');
      journal.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const undo = async (grade) => {
    setError('');
    try {
      await api(`/teacher/grades/${grade.id}/undo`, { method: 'POST' });
      journal.reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const students = journal.data?.students || [];

  return (
    <Card className="fade-up">
      <h3>Ballar jurnali</h3>
      <div className="row wrap">
        <Select value={groupId} onChange={(e) => { setGroupId(e.target.value); setSubjectId(''); }}>
          <option value="">Guruhni tanlang</option>
          {groups.data?.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </Select>
        <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!groupId}>
          <option value="">Fanni tanlang</option>
          {subjectsForGroup.map((s) => (
            <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
          ))}
        </Select>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

      {groupId && !subjectsForGroup.length && (
        <Empty>Bu guruhga fan biriktirilmagan. “Guruh/Fan” bo‘limida biriktiring.</Empty>
      )}

      {groupId && subjectId && (
        <>
          <div className="row wrap">
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <Button variant="ghost" onClick={() => setExtraDates((d) => [...new Set([...d, newDate])])}>
              + Sana qo‘shish
            </Button>
          </div>
          <ErrorText error={error || journal.error} />

          <div className="journal-wrap">
            <table className="journal">
              <thead>
                <tr>
                  <th>O‘quvchi</th>
                  {dates.map((d) => (
                    <th key={d}>{d.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td className="sticky">{s.full_name}</td>
                    {dates.map((d) => {
                      const g = gradeMap.get(`${s.id}|${d}`);
                      return (
                        <td key={d}>
                          <div className="cell">
                            <input
                              key={`${s.id}-${d}-${g?.score ?? ''}`}
                              className={`score-input ${g ? (g.score >= 80 ? 'good' : g.score >= 50 ? 'mid' : 'bad') : ''}`}
                              type="number"
                              min="0"
                              max="100"
                              defaultValue={g?.score ?? ''}
                              onBlur={(e) => saveCell(s.id, d, e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                            {g && (
                              <button className="undo" title="Oxirgi o‘zgarishni bekor qilish" onClick={() => undo(g)}>
                                ↶
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!students.length && <Empty>Bu guruhda faol o‘quvchi yo‘q</Empty>}
        </>
      )}
    </Card>
  );
}

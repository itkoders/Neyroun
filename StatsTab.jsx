import { useState } from 'react';
import { RankBars, SubjectLines } from '../../components/Charts.jsx';
import { Card, Empty, ErrorText, Input, Select, currentMonth, useFetch } from '../../components/ui.jsx';

export default function StatsTab() {
  const groups = useFetch('/teacher/groups');
  const [groupId, setGroupId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [studentId, setStudentId] = useState('');
  const ranking = useFetch(groupId ? `/teacher/stats/group/${groupId}?month=${month}` : null);
  const students = useFetch(groupId ? `/teacher/students?group_id=${groupId}` : null);
  const series = useFetch(studentId ? `/teacher/stats/student/${studentId}` : null);

  return (
    <div className="stack">
      <Card className="fade-up">
        <h3>Guruh reytingi</h3>
        <div className="row wrap">
          <Select value={groupId} onChange={(e) => { setGroupId(e.target.value); setStudentId(''); }}>
            <option value="">Guruhni tanlang</option>
            {groups.data?.groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <ErrorText error={ranking.error} />
        {groupId && ranking.data && <RankBars students={ranking.data.students} />}
      </Card>

      {groupId && (
        <Card className="fade-up">
          <h3>O‘quvchi dinamikasi</h3>
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">O‘quvchini tanlang</option>
            {students.data?.students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </Select>
          <ErrorText error={series.error} />
          {studentId && series.data && !series.data.series.length && <Empty>Ma‘lumot yo‘q</Empty>}
          {studentId && series.data && <SubjectLines series={series.data.series} />}
        </Card>
      )}
    </div>
  );
}

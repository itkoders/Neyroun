import { useState } from 'react';
import Leaderboard from '../components/Leaderboard.jsx';
import Notifications from '../components/Notifications.jsx';
import { Tabs } from '../components/ui.jsx';
import JournalTab from './teacher/JournalTab.jsx';
import StudentsTab from './teacher/StudentsTab.jsx';
import PaymentsTab from './teacher/PaymentsTab.jsx';
import StatsTab from './teacher/StatsTab.jsx';
import SetupTab from './teacher/SetupTab.jsx';

const TABS = [
  { id: 'journal', label: 'Jurnal' },
  { id: 'students', label: 'O‘quvchilar' },
  { id: 'payments', label: 'To‘lovlar' },
  { id: 'stats', label: 'Statistika' },
  { id: 'setup', label: 'Guruh/Fan' },
  { id: 'rank', label: 'Reyting' },
  { id: 'notes', label: 'Xabarlar' },
];

export default function TeacherHome() {
  const [tab, setTab] = useState('journal');
  return (
    <main className="page">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'journal' && <JournalTab />}
      {tab === 'students' && <StudentsTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'setup' && <SetupTab />}
      {tab === 'rank' && <Leaderboard />}
      {tab === 'notes' && <Notifications />}
    </main>
  );
}

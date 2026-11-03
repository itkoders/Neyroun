import { useEffect } from 'react';
import { api } from '../api.js';
import { Card, Empty, useFetch } from './ui.jsx';

const LABELS = {
  grade: '📝 Yangi baho',
  low_score: '⚠️ Past ball',
  overdue: '⏰ To‘lov muddati o‘tdi',
  penalty: '💸 Jarima',
  crown: '👑 Haftalik toj',
};

export default function Notifications() {
  const { data, error, reload } = useFetch('/notifications');

  useEffect(() => {
    if (!data?.unread) return undefined;
    const t = setTimeout(() => api('/notifications/read', { method: 'POST' }).then(reload), 2500);
    return () => clearTimeout(t);
  }, [data?.unread, reload]);

  if (error) return <Empty>{error}</Empty>;
  if (!data) return null;
  if (!data.notifications.length) return <Empty>Hozircha bildirishnoma yo‘q</Empty>;

  return (
    <div className="stack">
      {data.notifications.map((n) => (
        <Card key={n.id} className={`notif ${n.read_at ? '' : 'unread'} kind-${n.kind}`}>
          <div className="row between">
            <strong>{LABELS[n.kind] || n.kind}</strong>
            <small className="muted">{new Date(n.created_at).toLocaleString('uz-UZ')}</small>
          </div>
        </Card>
      ))}
    </div>
  );
}

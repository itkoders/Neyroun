import { Empty, useFetch } from './ui.jsx';

/** Haftalik reyting. Eng yaxshi 5 o'quvchi ismi yonida 👑 bilan chiqadi. */
export default function Leaderboard() {
  const { data, error } = useFetch('/crowns');

  if (error) return <Empty>{error}</Empty>;
  if (!data) return null;
  if (!data.crowns.length) return <Empty>{data.week_start} haftasi uchun reyting hali yo‘q</Empty>;

  return (
    <div className="leaderboard">
      <p className="muted">Hafta: {data.week_start}</p>
      {data.crowns.map((c, i) => (
        <div key={c.student_id} className="lb-row" style={{ animationDelay: `${i * 90}ms` }}>
          <span className={`lb-rank rank-${c.rank}`}>{c.rank}</span>
          <div className="lb-name">
            <span className="crown">👑</span> {c.full_name}
            <small>{c.group_name}</small>
          </div>
          <span className="lb-score">{Number(c.avg_score).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

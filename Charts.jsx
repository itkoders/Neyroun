import {
  Bar, BarChart, Cell, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

const COLORS = ['#a78bfa', '#38bdf8', '#39ff88', '#f472b6', '#facc15', '#fb923c'];
const AXIS = '#94a3b8';
const tooltipStyle = {
  background: 'rgba(11,6,32,.95)',
  border: '1px solid rgba(167,139,250,.35)',
  borderRadius: 12,
  color: '#fff',
};

/** Fanlar bo'yicha oylik o'rtacha — animatsiyali chiziqli diagramma. */
export function SubjectLines({ series }) {
  if (!series?.length) return null;
  const months = [...new Set(series.map((r) => r.month))].sort();
  const subjects = [...new Set(series.map((r) => r.subject))];
  const data = months.map((m) => {
    const row = { month: m.slice(0, 7) };
    series.filter((r) => r.month === m).forEach((r) => (row[r.subject] = r.avg_score));
    return row;
  });

  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,.06)" />
          <XAxis dataKey="month" stroke={AXIS} fontSize={12} />
          <YAxis domain={[0, 100]} stroke={AXIS} fontSize={12} />
          <Tooltip contentStyle={tooltipStyle} />
          {subjects.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={3}
              dot={{ r: 4 }}
              isAnimationActive
              animationDuration={1200}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Guruh reytingi — o'quvchilar o'rtacha ball bo'yicha animatsiyali ustunlar. */
export function RankBars({ students }) {
  const data = (students || [])
    .filter((s) => s.avg_score != null)
    .map((s) => ({ name: s.full_name, avg: s.avg_score }));
  if (!data.length) return <p className="empty">Bu oy uchun ballar yo‘q</p>;

  const color = (v) => (v >= 80 ? '#39ff88' : v >= 50 ? '#38bdf8' : '#ff5577');
  return (
    <div className="chart" style={{ height: Math.max(200, data.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" domain={[0, 100]} stroke={AXIS} fontSize={12} />
          <YAxis type="category" dataKey="name" width={110} stroke={AXIS} fontSize={12} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="avg" radius={[0, 10, 10, 0]} animationDuration={1000}>
            {data.map((d, i) => (
              <Cell key={i} fill={color(d.avg)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

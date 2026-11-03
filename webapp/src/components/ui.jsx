import { useEffect, useState } from 'react';
import { api } from '../api.js';

export const today = () => new Date().toISOString().slice(0, 10);
export const currentMonth = () => new Date().toISOString().slice(0, 7);
export const formatSum = (n) => Number(n || 0).toLocaleString('uz-UZ') + ' so‘m';

/** Ma'lumot olish uchun hook. path=null bo'lsa so'rov yuborilmaydi. */
export function useFetch(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!path) {
      setData(null);
      return undefined;
    }
    setError('');
    api(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  return { data, error, reload: () => setTick((t) => t + 1) };
}

export function Card({ children, className = '', style }) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className="input" {...props}>
      {children}
    </select>
  );
}

export function Chip({ tone = 'neutral', children }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

export function ErrorText({ error }) {
  return error ? <p className="error">{error}</p> : null;
}

export function Splash() {
  return (
    <div className="splash">
      <div className="logo">NEURON</div>
      <div className="pulse" />
    </div>
  );
}

export const scoreTone = (s) => (s >= 80 ? 'good' : s >= 50 ? 'mid' : 'bad');

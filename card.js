import { Resvg } from '@resvg/resvg-js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CIRCUMFERENCE = 2 * Math.PI * 110;

function scoreColor(score) {
  if (score >= 80) return '#39ff88';
  if (score >= 50) return '#38bdf8';
  return '#ff5577';
}

/**
 * Ball kartochkasi: neon uslubda, PNG buffer qaytaradi (Telegram'ga rasm sifatida yuboriladi).
 */
export function renderGradeCard({ studentName, subject, score, date, groupName }) {
  const color = scoreColor(score);
  const dash = (CIRCUMFERENCE * score) / 100;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0620"/>
      <stop offset="1" stop-color="#1c0b40"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#a78bfa"/>
      <stop offset="1" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="900" height="520" rx="36" fill="url(#bg)"/>
  <rect x="24" y="24" width="852" height="472" rx="28" fill="none" stroke="url(#accent)" stroke-opacity="0.35" stroke-width="2"/>
  <text x="60" y="88" fill="url(#accent)" font-family="sans-serif" font-size="34" font-weight="700" letter-spacing="6">NEURON</text>
  <text x="60" y="180" fill="#ffffff" font-family="sans-serif" font-size="46" font-weight="700">${esc(studentName)}</text>
  <text x="60" y="235" fill="#c4b5fd" font-family="sans-serif" font-size="30">${esc(subject)}</text>
  <text x="60" y="280" fill="#94a3b8" font-family="sans-serif" font-size="24">${esc(groupName || '')}</text>
  <text x="60" y="440" fill="#94a3b8" font-family="sans-serif" font-size="26">${esc(date)}</text>
  <g transform="translate(650 260)">
    <circle r="110" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="22"/>
    <circle r="110" fill="none" stroke="${color}" stroke-width="22" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}" transform="rotate(-90)"/>
    <text y="18" text-anchor="middle" fill="${color}" font-family="sans-serif" font-size="78" font-weight="800">${esc(score)}</text>
    <text y="62" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="24">/ 100</text>
  </g>
</svg>`;

  return new Resvg(svg, { fitTo: { mode: 'width', value: 900 } }).render().asPng();
}

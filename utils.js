const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
export const isDate = (v) => typeof v === 'string' && DATE_RE.test(v);
export const isMonth = (v) => typeof v === 'string' && MONTH_RE.test(v);
export const isScore = (v) => Number.isInteger(v) && v >= 0 && v <= 100;

export function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

/** Joriy oy, YYYY-MM formatida. */
export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Oyning boshlanish va keyingi oy boshlanish sanalari (YYYY-MM-DD). */
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/** Oldingi to'liq haftaning dushanba kuni (YYYY-MM-DD). */
export function lastWeekMonday(now = new Date()) {
  const day = (now.getUTCDay() + 6) % 7; // dushanba = 0
  const thisMonday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day);
  return new Date(thisMonday - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

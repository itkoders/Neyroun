import { readToken } from './auth.js';
import { query } from './db.js';

/** Bearer token bo'lsa foydalanuvchini req.user ga qo'yadi. */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Kirish talab qilinadi' });

  try {
    const payload = readToken(token);
    const { rows } = await query(
      'SELECT id, role, full_name, must_change_password, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Foydalanuvchi faol emas' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan' });
  }
}

/** Faqat ko'rsatilgan rollarga ruxsat beradi. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Ruxsat yo‘q' });
    }
    next();
  };
}

/** Parol almashtirilmagan bo'lsa, faqat parolni o'zgartirish endpointiga ruxsat. */
export function requirePasswordChanged(req, res, next) {
  if (req.user?.must_change_password) {
    return res.status(403).json({
      error: 'Avval parolni almashtiring',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
}

export async function audit(actorId, action, entity, entityId, meta = {}) {
  await query(
    'INSERT INTO audit_log (actor_id, action, entity, entity_id, meta) VALUES ($1, $2, $3, $4, $5)',
    [actorId, action, entity, entityId, JSON.stringify(meta)]
  );
}

import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requirePasswordChanged } from '../middleware.js';
import { isDate, badRequest } from '../utils.js';
import { lastWeekMonday } from '../utils.js';

const router = Router();
router.use(authenticate, requirePasswordChanged);

// GET /api/crowns?week_start=YYYY-MM-DD — haftalik 👑 reytingi (barcha rollar uchun)
router.get('/crowns', async (req, res) => {
  const weekStart = req.query.week_start || lastWeekMonday();
  if (!isDate(weekStart)) return badRequest(res, 'week_start YYYY-MM-DD bo‘lsin');

  const { rows } = await query(
    `SELECT wc.rank, wc.avg_score::float8 AS avg_score,
            s.id AS student_id, s.full_name, g.name AS group_name
     FROM weekly_crowns wc
     JOIN students s ON s.id = wc.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE wc.week_start = $1::date
     ORDER BY wc.rank`,
    [weekStart]
  );
  res.json({ week_start: weekStart, crowns: rows });
});

// GET /api/notifications — foydalanuvchining so'nggi bildirishnomalari
router.get('/notifications', async (req, res) => {
  const { rows } = await query(
    `SELECT id, kind, payload, read_at, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [req.user.id]
  );
  const unread = rows.filter((r) => !r.read_at).length;
  res.json({ unread, notifications: rows });
});

// POST /api/notifications/read — barchasini o'qilgan deb belgilash
router.post('/notifications/read', async (req, res) => {
  await query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [req.user.id]
  );
  res.json({ ok: true });
});

export default router;

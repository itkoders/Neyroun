import { Router } from 'express';
import { query } from '../db.js';
import { authenticate, requireRole, requirePasswordChanged, audit } from '../middleware.js';
import { parentCanSeeStudent } from '../access.js';
import { isUuid, isMonth, currentMonth, monthBounds, badRequest } from '../utils.js';

const router = Router();

router.use(authenticate, requirePasswordChanged, requireRole('parent'));

// GET /api/parent/students/search?q=ali  — guruh va ism bo'yicha qidiruv
router.get('/students/search', async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const { rows } = await query(
    `SELECT s.id, s.full_name, g.name AS group_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE s.is_active AND s.full_name ILIKE $1
     ORDER BY s.full_name
     LIMIT 30`,
    [q]
  );
  res.json({ students: rows });
});

// POST /api/parent/links  { student_id } — admin tasdig'iga yuboriladi
router.post('/links', async (req, res) => {
  const { student_id } = req.body || {};
  if (!student_id) return res.status(400).json({ error: 'student_id kerak' });

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS n FROM parent_student_links
     WHERE parent_id = $1 AND status IN ('approved', 'pending')`,
    [req.user.id]
  );
  if (countRows[0].n >= 3) {
    return res.status(409).json({ error: 'Bir ota-onaga 3 tadan ko‘p farzand biriktirib bo‘lmaydi' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO parent_student_links (parent_id, student_id)
       VALUES ($1, $2) RETURNING id, status, requested_at`,
      [req.user.id, student_id]
    );
    await audit(req.user.id, 'link.request', 'parent_student_links', rows[0].id);
    res.status(201).json({ link: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu farzandga so‘rov allaqachon yuborilgan' });
    }
    throw err;
  }
});

// GET /api/parent/children — tasdiqlangan farzandlar
router.get('/children', async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.full_name, g.name AS group_name
     FROM parent_student_links l
     JOIN students s ON s.id = l.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE l.parent_id = $1 AND l.status = 'approved'
     ORDER BY s.full_name`,
    [req.user.id]
  );
  res.json({ children: rows });
});

// GET /children/:id/journal?month=YYYY-MM — farzandning oylik baholari
router.get('/children/:id/journal', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  if (!(await parentCanSeeStudent(req.user.id, req.params.id))) {
    return res.status(403).json({ error: 'Bu farzand sizga biriktirilmagan' });
  }
  const month = req.query.month || currentMonth();
  if (!isMonth(month)) return badRequest(res, 'month YYYY-MM formatida bo‘lsin');
  const { start, end } = monthBounds(month);

  const { rows } = await query(
    `SELECT gr.id, gr.score, gr.lesson_date, gr.comment, sub.name AS subject
     FROM grades gr
     JOIN subjects sub ON sub.id = gr.subject_id
     WHERE gr.student_id = $1 AND gr.lesson_date >= $2 AND gr.lesson_date < $3
     ORDER BY gr.lesson_date`,
    [req.params.id, start, end]
  );
  res.json({ month, grades: rows });
});

// GET /children/:id/monthly — fanlar bo'yicha oylik o'rtacha (diagramma)
router.get('/children/:id/monthly', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  if (!(await parentCanSeeStudent(req.user.id, req.params.id))) {
    return res.status(403).json({ error: 'Bu farzand sizga biriktirilmagan' });
  }
  const { rows } = await query(
    `SELECT v.month, sub.name AS subject, v.avg_score::float8 AS avg_score, v.grades_count
     FROM v_student_monthly_avg v
     JOIN subjects sub ON sub.id = v.subject_id
     WHERE v.student_id = $1
     ORDER BY v.month DESC, sub.name
     LIMIT 120`,
    [req.params.id]
  );
  res.json({ series: rows });
});

// GET /children/:id/payments — farzandning to'lov tarixi
router.get('/children/:id/payments', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  if (!(await parentCanSeeStudent(req.user.id, req.params.id))) {
    return res.status(403).json({ error: 'Bu farzand sizga biriktirilmagan' });
  }
  const { rows } = await query(
    `SELECT p.id, p.period_month, p.amount_due::float8 AS amount_due,
            p.penalty::float8 AS penalty, p.status, p.paid_at,
            p.paid_amount::float8 AS paid_amount,
            (p.period_month + (pl.due_day - 1)) AS due_date
     FROM payments p
     JOIN payment_plans pl ON pl.id = p.plan_id
     WHERE pl.student_id = $1
     ORDER BY p.period_month DESC
     LIMIT 24`,
    [req.params.id]
  );
  res.json({ payments: rows });
});

export default router;

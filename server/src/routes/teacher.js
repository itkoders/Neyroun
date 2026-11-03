import { Router } from 'express';
import { query, pool } from '../db.js';
import { authenticate, requireRole, requirePasswordChanged, audit } from '../middleware.js';
import { teacherCanGradeStudentSubject } from '../access.js';
import {
  isUuid, isDate, isMonth, isScore, currentMonth, monthBounds, badRequest,
} from '../utils.js';

const router = Router();
router.use(authenticate, requirePasswordChanged, requireRole('teacher'));

/* ---------------- Guruhlar ---------------- */

router.get('/groups', async (_req, res) => {
  const { rows } = await query(`
    SELECT g.id, g.name, g.description,
           COUNT(s.id) FILTER (WHERE s.is_active)::int AS students_count
    FROM groups g
    LEFT JOIN students s ON s.group_id = g.id
    GROUP BY g.id
    ORDER BY g.name`);
  res.json({ groups: rows });
});

router.post('/groups', async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Guruh nomi kiritilishi shart');
  try {
    const { rows } = await query(
      'INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING *',
      [name, req.body.description || null]
    );
    await audit(req.user.id, 'group.create', 'groups', rows[0].id);
    res.status(201).json({ group: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Bunday guruh mavjud' });
    throw err;
  }
});

/* ---------------- Fanlar va biriktirish ---------------- */

router.get('/subjects', async (_req, res) => {
  const { rows } = await query('SELECT id, name FROM subjects ORDER BY name');
  res.json({ subjects: rows });
});

router.post('/subjects', async (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) return badRequest(res, 'Fan nomi kiritilishi shart');
  const { rows } = await query(
    `INSERT INTO subjects (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
    [name]
  );
  res.status(201).json({ subject: rows[0] });
});

router.get('/assignments', async (req, res) => {
  const { rows } = await query(
    `SELECT ta.subject_id, s.name AS subject_name,
            ta.group_id, g.name AS group_name, ta.weight::float8 AS weight
     FROM teaching_assignments ta
     JOIN subjects s ON s.id = ta.subject_id
     JOIN groups g ON g.id = ta.group_id
     WHERE ta.teacher_id = $1
     ORDER BY g.name, s.name`,
    [req.user.id]
  );
  res.json({ assignments: rows });
});

// Fanni guruhga biriktirish (ballar shu fan bo'yicha qo'yiladi)
router.post('/assignments', async (req, res) => {
  const { subject_id, group_id } = req.body || {};
  const weight = req.body?.weight ?? 1;
  if (!isUuid(subject_id) || !isUuid(group_id)) {
    return badRequest(res, 'subject_id va group_id kerak');
  }
  if (typeof weight !== 'number' || weight <= 0 || weight > 10) {
    return badRequest(res, 'Og‘irlik 0 dan 10 gacha bo‘lishi kerak');
  }
  await query(
    `INSERT INTO teaching_assignments (teacher_id, subject_id, group_id, weight)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (teacher_id, subject_id, group_id) DO UPDATE SET weight = EXCLUDED.weight`,
    [req.user.id, subject_id, group_id, weight]
  );
  await audit(req.user.id, 'assignment.upsert', 'teaching_assignments', group_id, { subject_id, weight });
  res.status(201).json({ ok: true });
});

/* ---------------- O'quvchilar ---------------- */

router.get('/students', async (req, res) => {
  const { group_id, q } = req.query;
  const params = [];
  const where = ['s.is_active'];

  if (group_id) {
    if (!isUuid(group_id)) return badRequest(res, 'group_id noto‘g‘ri');
    params.push(group_id);
    where.push(`s.group_id = $${params.length}`);
  }
  if (q) {
    params.push(`%${String(q).trim()}%`);
    where.push(`s.full_name ILIKE $${params.length}`);
  }

  const { rows } = await query(
    `SELECT s.id, s.full_name, s.group_id, s.birth_date, g.name AS group_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE ${where.join(' AND ')}
     ORDER BY s.full_name
     LIMIT 200`,
    params
  );
  res.json({ students: rows });
});

router.post('/students', async (req, res) => {
  const { group_id, birth_date } = req.body || {};
  const full_name = req.body?.full_name?.trim();
  if (!full_name) return badRequest(res, 'Ism kiritilishi shart');
  if (!isUuid(group_id)) return badRequest(res, 'Guruh tanlanishi kerak');
  if (birth_date && !isDate(birth_date)) return badRequest(res, 'Tug‘ilgan sana YYYY-MM-DD bo‘lsin');

  const { rows } = await query(
    'INSERT INTO students (full_name, group_id, birth_date) VALUES ($1, $2, $3) RETURNING *',
    [full_name, group_id, birth_date || null]
  );
  await audit(req.user.id, 'student.create', 'students', rows[0].id);
  res.status(201).json({ student: rows[0] });
});

router.patch('/students/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  const { group_id, is_active } = req.body || {};
  const full_name = req.body?.full_name?.trim() || null;
  const changeGroup = Object.prototype.hasOwnProperty.call(req.body || {}, 'group_id');
  if (changeGroup && group_id !== null && !isUuid(group_id)) {
    return badRequest(res, 'group_id noto‘g‘ri');
  }

  const { rows } = await query(
    `UPDATE students SET
       full_name = COALESCE($2, full_name),
       group_id  = CASE WHEN $3::boolean THEN $4::uuid ELSE group_id END,
       is_active = COALESCE($5::boolean, is_active)
     WHERE id = $1
     RETURNING *`,
    [req.params.id, full_name, changeGroup, group_id ?? null, is_active ?? null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'O‘quvchi topilmadi' });
  await audit(req.user.id, 'student.update', 'students', rows[0].id);
  res.json({ student: rows[0] });
});

/* ---------------- Jurnal va ballar ---------------- */

// GET /journal?group_id=&subject_id=&month=YYYY-MM — jurnal ko'rinishi uchun
router.get('/journal', async (req, res) => {
  const { group_id, subject_id } = req.query;
  const month = req.query.month || currentMonth();
  if (!isUuid(group_id) || !isUuid(subject_id)) {
    return badRequest(res, 'group_id va subject_id kerak');
  }
  if (!isMonth(month)) return badRequest(res, 'month YYYY-MM formatida bo‘lsin');

  const { start, end } = monthBounds(month);
  const students = await query(
    'SELECT id, full_name FROM students WHERE group_id = $1 AND is_active ORDER BY full_name',
    [group_id]
  );
  const grades = await query(
    `SELECT gr.id, gr.student_id, gr.score, gr.lesson_date, gr.comment, gr.teacher_id
     FROM grades gr
     JOIN students s ON s.id = gr.student_id
     WHERE s.group_id = $1 AND gr.subject_id = $2
       AND gr.lesson_date >= $3 AND gr.lesson_date < $4
     ORDER BY gr.lesson_date`,
    [group_id, subject_id, start, end]
  );
  res.json({ month, students: students.rows, grades: grades.rows });
});

router.post('/grades', async (req, res) => {
  const { student_id, subject_id, score, comment } = req.body || {};
  const lesson_date = req.body?.lesson_date || new Date().toISOString().slice(0, 10);
  if (!isUuid(student_id) || !isUuid(subject_id)) {
    return badRequest(res, 'student_id va subject_id kerak');
  }
  if (!isScore(score)) return badRequest(res, 'Ball 0 dan 100 gacha butun son bo‘lishi kerak');
  if (!isDate(lesson_date)) return badRequest(res, 'Sana YYYY-MM-DD bo‘lsin');

  const { rows: st } = await query(
    'SELECT group_id FROM students WHERE id = $1 AND is_active',
    [student_id]
  );
  if (!st[0]) return res.status(404).json({ error: 'O‘quvchi topilmadi' });

  const allowed = await teacherCanGradeStudentSubject(req.user.id, st[0].group_id, subject_id);
  if (!allowed) {
    return res.status(403).json({ error: 'Bu fan ushbu guruhga biriktirilmagan' });
  }

  const { rows } = await query(
    `INSERT INTO grades (student_id, subject_id, teacher_id, score, lesson_date, comment)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [student_id, subject_id, req.user.id, score, lesson_date, comment || null]
  );
  await audit(req.user.id, 'grade.create', 'grades', rows[0].id, { score });

  // Tasdiqlangan ota-onalarga bildirishnoma (50 dan past bo'lsa ogohlantirish + ovoz)
  await query(
    `INSERT INTO notifications (user_id, kind, payload)
     SELECT l.parent_id, $2, jsonb_build_object('grade_id', $1::text)
     FROM parent_student_links l
     WHERE l.student_id = $3 AND l.status = 'approved'`,
    [rows[0].id, score < 50 ? 'low_score' : 'grade', student_id]
  );
  res.status(201).json({ grade: rows[0] });
});

// PATCH /grades/:id — faqat ballni qo'ygan o'qituvchi o'zgartiradi, tarix saqlanadi
router.patch('/grades/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  const { score, comment } = req.body || {};
  if (score !== undefined && !isScore(score)) {
    return badRequest(res, 'Ball 0 dan 100 gacha butun son bo‘lishi kerak');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM grades WHERE id = $1 FOR UPDATE', [req.params.id]);
    const grade = rows[0];
    if (!grade) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Baho topilmadi' });
    }
    if (grade.teacher_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Faqat ballni qo‘ygan o‘qituvchi o‘zgartira oladi' });
    }

    if (score !== undefined && score !== grade.score) {
      await client.query(
        'INSERT INTO grade_history (grade_id, old_score, new_score, changed_by) VALUES ($1, $2, $3, $4)',
        [grade.id, grade.score, score, req.user.id]
      );
    }
    const { rows: updated } = await client.query(
      `UPDATE grades SET
         score = COALESCE($2, score),
         comment = COALESCE($3, comment),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [grade.id, score ?? null, comment ?? null]
    );
    await client.query('COMMIT');
    res.json({ grade: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// POST /grades/:id/undo — oxirgi o'zgarishni bekor qilish
router.post('/grades/:id/undo', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: gRows } = await client.query('SELECT * FROM grades WHERE id = $1 FOR UPDATE', [req.params.id]);
    const grade = gRows[0];
    if (!grade || grade.teacher_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Baho topilmadi yoki ruxsat yo‘q' });
    }

    const { rows: hRows } = await client.query(
      'SELECT * FROM grade_history WHERE grade_id = $1 ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [grade.id]
    );
    const last = hRows[0];
    if (!last) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Bekor qilinadigan o‘zgarish yo‘q' });
    }

    await client.query('UPDATE grades SET score = $2, updated_at = now() WHERE id = $1', [grade.id, last.old_score]);
    await client.query('DELETE FROM grade_history WHERE id = $1', [last.id]);
    await client.query('COMMIT');
    await audit(req.user.id, 'grade.undo', 'grades', grade.id, { restored: last.old_score });
    res.json({ ok: true, score: last.old_score });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

/* ---------------- To'lov rejalari ---------------- */

router.get('/payment-plans', async (req, res) => {
  const { rows } = await query(
    `SELECT pl.id, pl.student_id, s.full_name AS student_name,
            pl.monthly_amount::float8 AS monthly_amount, pl.due_day,
            pl.penalty_amount::float8 AS penalty_amount, pl.is_active
     FROM payment_plans pl
     JOIN students s ON s.id = pl.student_id
     WHERE pl.teacher_id = $1
     ORDER BY s.full_name`,
    [req.user.id]
  );
  res.json({ plans: rows });
});

// O'qituvchi o'quvchi uchun oylik to'lovni belgilaydi (mavjud bo'lsa yangilaydi)
router.post('/payment-plans', async (req, res) => {
  const { student_id, monthly_amount } = req.body || {};
  const due_day = req.body?.due_day ?? 10;
  const penalty_amount = req.body?.penalty_amount ?? 0;

  if (!isUuid(student_id)) return badRequest(res, 'student_id kerak');
  if (typeof monthly_amount !== 'number' || monthly_amount < 0) {
    return badRequest(res, 'Oylik summa musbat son bo‘lishi kerak');
  }
  if (!Number.isInteger(due_day) || due_day < 1 || due_day > 28) {
    return badRequest(res, 'To‘lov kuni 1 dan 28 gacha bo‘lishi kerak');
  }
  if (typeof penalty_amount !== 'number' || penalty_amount < 0) {
    return badRequest(res, 'Jarima summasi musbat son bo‘lishi kerak');
  }

  const { rows } = await query(
    `INSERT INTO payment_plans (student_id, teacher_id, monthly_amount, due_day, penalty_amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (student_id, teacher_id) DO UPDATE SET
       monthly_amount = EXCLUDED.monthly_amount,
       due_day = EXCLUDED.due_day,
       penalty_amount = EXCLUDED.penalty_amount,
       is_active = TRUE
     RETURNING *`,
    [student_id, req.user.id, monthly_amount, due_day, penalty_amount]
  );
  await audit(req.user.id, 'payment_plan.upsert', 'payment_plans', rows[0].id);
  res.status(201).json({ plan: rows[0] });
});

/* ---------------- To'lovlar ---------------- */

// POST /payments/generate { month } — shu oy uchun faol rejalar bo'yicha to'lovlarni yaratadi
router.post('/payments/generate', async (req, res) => {
  const month = req.body?.month || currentMonth();
  if (!isMonth(month)) return badRequest(res, 'month YYYY-MM formatida bo‘lsin');
  const { start } = monthBounds(month);

  const { rowCount } = await query(
    `INSERT INTO payments (plan_id, period_month, amount_due)
     SELECT pl.id, $2::date, pl.monthly_amount
     FROM payment_plans pl
     WHERE pl.teacher_id = $1 AND pl.is_active
     ON CONFLICT (plan_id, period_month) DO NOTHING`,
    [req.user.id, start]
  );
  await audit(req.user.id, 'payments.generate', 'payments', null, { month, created: rowCount });
  res.json({ month, created: rowCount });
});

router.get('/payments', async (req, res) => {
  const month = req.query.month || currentMonth();
  if (!isMonth(month)) return badRequest(res, 'month YYYY-MM formatida bo‘lsin');
  const { start } = monthBounds(month);

  const { rows } = await query(
    `SELECT p.id, p.plan_id, p.period_month,
            p.amount_due::float8 AS amount_due,
            p.penalty::float8 AS penalty,
            p.status, p.paid_at, p.paid_amount::float8 AS paid_amount, p.note,
            (p.period_month + (pl.due_day - 1)) AS due_date,
            s.id AS student_id, s.full_name AS student_name, g.name AS group_name
     FROM payments p
     JOIN payment_plans pl ON pl.id = p.plan_id
     JOIN students s ON s.id = pl.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE pl.teacher_id = $1 AND p.period_month = $2::date
     ORDER BY s.full_name`,
    [req.user.id, start]
  );
  res.json({ month, payments: rows });
});

// Oylik to'lovni qabul qilingan deb belgilash (naqd pul)
router.post('/payments/:id/mark-paid', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  const paid_amount = req.body?.paid_amount ?? null;
  const note = req.body?.note ?? null;
  if (paid_amount !== null && (typeof paid_amount !== 'number' || paid_amount < 0)) {
    return badRequest(res, 'To‘langan summa musbat son bo‘lishi kerak');
  }

  const { rows } = await query(
    `UPDATE payments p SET
       status = 'paid',
       paid_at = now(),
       paid_amount = COALESCE($3::numeric, p.amount_due + p.penalty),
       note = COALESCE($4, p.note)
     FROM payment_plans pl
     WHERE p.id = $1 AND pl.id = p.plan_id AND pl.teacher_id = $2
     RETURNING p.id, p.status, p.paid_amount::float8 AS paid_amount`,
    [req.params.id, req.user.id, paid_amount, note]
  );
  if (!rows[0]) return res.status(404).json({ error: 'To‘lov topilmadi' });
  await audit(req.user.id, 'payment.mark_paid', 'payments', rows[0].id, { amount: rows[0].paid_amount });
  res.json({ payment: rows[0] });
});

// Jarimani o'qituvchi qo'lda qo'yadi; ota-onaga bildirishnoma boradi
router.post('/payments/:id/penalty', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  const penalty = req.body?.penalty;
  if (typeof penalty !== 'number' || penalty < 0) {
    return badRequest(res, 'Jarima summasi musbat son bo‘lishi kerak');
  }

  const { rows } = await query(
    `UPDATE payments p SET
       penalty = $3, penalty_set_by = $2, penalty_set_at = now()
     FROM payment_plans pl
     WHERE p.id = $1 AND pl.id = p.plan_id AND pl.teacher_id = $2 AND p.status <> 'paid'
     RETURNING p.id, p.plan_id, p.penalty::float8 AS penalty`,
    [req.params.id, req.user.id, penalty]
  );
  if (!rows[0]) {
    return res.status(409).json({ error: 'To‘lov topilmadi yoki allaqachon to‘langan' });
  }

  await query(
    `INSERT INTO notifications (user_id, kind, payload)
     SELECT l.parent_id, 'penalty', jsonb_build_object('payment_id', $2::text, 'amount', $3::numeric)
     FROM payment_plans pl
     JOIN parent_student_links l ON l.student_id = pl.student_id AND l.status = 'approved'
     WHERE pl.id = $1`,
    [rows[0].plan_id, rows[0].id, penalty]
  );
  await audit(req.user.id, 'payment.penalty', 'payments', rows[0].id, { penalty });
  res.json({ payment: rows[0] });
});

/* ---------------- Statistika (diagrammalar) ---------------- */

// Guruh bo'yicha oylik reyting
router.get('/stats/group/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
  const month = req.query.month || currentMonth();
  if (!isMonth(month)) return badRequest(res, 'month YYYY-MM formatida bo‘lsin');
  const { start, end } = monthBounds(month);

  const { rows } = await query(
    `SELECT s.id, s.full_name,
            ROUND(AVG(gr.score), 2)::float8 AS avg_score,
            COUNT(gr.id)::int AS grades_count
     FROM students s
     LEFT JOIN grades gr ON gr.student_id = s.id
       AND gr.lesson_date >= $2 AND gr.lesson_date < $3
     WHERE s.group_id = $1 AND s.is_active
     GROUP BY s.id
     ORDER BY avg_score DESC NULLS LAST, s.full_name`,
    [req.params.id, start, end]
  );
  res.json({ month, students: rows });
});

// O'quvchi bo'yicha oylik fan kesimi (chiziqli diagramma uchun)
router.get('/stats/student/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return badRequest(res, 'id noto‘g‘ri');
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

export default router;

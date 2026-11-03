import { Router } from 'express';
import { query, pool } from '../db.js';
import { hashPassword, generatePassword } from '../auth.js';
import { authenticate, requireRole, requirePasswordChanged, audit } from '../middleware.js';

const router = Router();

router.use(authenticate, requirePasswordChanged, requireRole('admin'));

/**
 * POST /api/admin/accounts
 * Admin o'qituvchi yoki ota-ona yaratadi va vaqtinchalik login/parol beradi.
 * Body: { role: 'teacher' | 'parent', login, full_name, phone? }
 * Javobda parol faqat bir marta qaytariladi.
 */
router.post('/accounts', async (req, res) => {
  const { role, login, full_name, phone } = req.body || {};
  if (!['teacher', 'parent'].includes(role)) {
    return res.status(400).json({ error: 'Rol faqat teacher yoki parent bo‘lishi mumkin' });
  }
  if (!login || !full_name) {
    return res.status(400).json({ error: 'Login va ism kiritilishi shart' });
  }

  const tempPassword = generatePassword(10);
  try {
    const { rows } = await query(
      `INSERT INTO users (role, login, password_hash, full_name, phone, created_by, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id, role, login, full_name`,
      [role, login.trim(), await hashPassword(tempPassword), full_name.trim(), phone || null, req.user.id]
    );
    await audit(req.user.id, 'account.create', 'user', rows[0].id, { role });
    res.status(201).json({ account: rows[0], temporary_password: tempPassword });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bu login band' });
    }
    throw err;
  }
});

// POST /api/admin/accounts/:id/reset-password
router.post('/accounts/:id/reset-password', async (req, res) => {
  const tempPassword = generatePassword(10);
  const { rowCount } = await query(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE
     WHERE id = $2 AND role IN ('teacher', 'parent')`,
    [await hashPassword(tempPassword), req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Hisob topilmadi' });
  await audit(req.user.id, 'account.reset_password', 'user', req.params.id);
  res.json({ temporary_password: tempPassword });
});

// GET /api/admin/link-requests?status=pending
router.get('/link-requests', async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
    ? req.query.status
    : 'pending';
  const { rows } = await query(
    `SELECT l.id, l.status, l.requested_at,
            p.id AS parent_id, p.full_name AS parent_name,
            s.id AS student_id, s.full_name AS student_name, g.name AS group_name
     FROM parent_student_links l
     JOIN users p ON p.id = l.parent_id
     JOIN students s ON s.id = l.student_id
     LEFT JOIN groups g ON g.id = s.group_id
     WHERE l.status = $1
     ORDER BY l.requested_at`,
    [status]
  );
  res.json({ requests: rows });
});

// POST /api/admin/link-requests/:id/decide  { approve: boolean }
router.post('/link-requests/:id/decide', async (req, res) => {
  const approve = req.body?.approve === true;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE parent_student_links
       SET status = $1, decided_by = $2, decided_at = now()
       WHERE id = $3 AND status = 'pending'
       RETURNING id, parent_id, student_id, status`,
      [approve ? 'approved' : 'rejected', req.user.id, req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'So‘rov topilmadi yoki allaqachon ko‘rib chiqilgan' });
    }
    await client.query('COMMIT');
    await audit(req.user.id, approve ? 'link.approve' : 'link.reject', 'parent_student_links', rows[0].id);
    res.json({ link: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message?.includes('3 tadan ko')) {
      return res.status(409).json({ error: 'Ota-onada allaqachon 3 ta tasdiqlangan farzand bor' });
    }
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/admin/accounts?role=teacher|parent — o'qituvchi va ota-onalar ro'yxati
router.get('/accounts', async (req, res) => {
  const role = ['teacher', 'parent'].includes(req.query.role) ? req.query.role : null;
  const { rows } = await query(
    `SELECT id, role, login, full_name, phone, is_active, must_change_password, created_at
     FROM users
     WHERE role IN ('teacher', 'parent') AND ($1::user_role IS NULL OR role = $1::user_role)
     ORDER BY full_name`,
    [role]
  );
  res.json({ accounts: rows });
});

// PATCH /api/admin/accounts/:id { is_active } — hisobni faollashtirish/o'chirish
router.patch('/accounts/:id', async (req, res) => {
  if (typeof req.body?.is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active (true/false) kerak' });
  }
  const { rows } = await query(
    `UPDATE users SET is_active = $2
     WHERE id = $1 AND role IN ('teacher', 'parent')
     RETURNING id, role, login, full_name, is_active`,
    [req.params.id, req.body.is_active]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Hisob topilmadi' });
  await audit(req.user.id, req.body.is_active ? 'account.activate' : 'account.deactivate', 'user', rows[0].id);
  res.json({ account: rows[0] });
});

export default router;

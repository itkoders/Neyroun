import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { authenticate } from '../middleware.js';
import { verifyInitData } from '../bot/initData.js';

const router = Router();

// Vaqt hujumidan himoya: foydalanuvchi topilmasa ham bir xil vaqt sarflanadi
const DUMMY_HASH = bcrypt.hashSync('neuron-dummy-password', 12);

const publicUser = (u) => ({
  id: u.id,
  role: u.role,
  full_name: u.full_name,
  must_change_password: u.must_change_password,
});

// POST /api/auth/login  { login, password, init_data? }
// init_data berilsa, Telegram akkaunti shu hisobga bog'lanadi.
router.post('/login', async (req, res) => {
  const { login, password, init_data } = req.body || {};
  if (!login || !password) {
    return res.status(400).json({ error: 'Login va parol kiritilishi shart' });
  }

  const { rows } = await query(
    'SELECT id, role, full_name, password_hash, must_change_password, is_active FROM users WHERE login = $1',
    [login.trim()]
  );
  const user = rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok || !user.is_active) {
    return res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' });
  }

  const tg = init_data ? verifyInitData(init_data, process.env.BOT_TOKEN) : null;
  if (tg?.id) {
    // Telegram ID faqat bitta hisobga bog'lanadi
    await query(
      `UPDATE users SET telegram_id = $1
       WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM users WHERE telegram_id = $1 AND id <> $2)`,
      [tg.id, user.id]
    );
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/telegram  { init_data } — bog'langan Telegram akkaunt orqali avtomatik kirish
router.post('/telegram', async (req, res) => {
  const tg = verifyInitData(req.body?.init_data, process.env.BOT_TOKEN);
  if (!tg?.id) return res.status(401).json({ error: 'Telegram ma‘lumoti yaroqsiz' });

  const { rows } = await query(
    'SELECT id, role, full_name, must_change_password, is_active FROM users WHERE telegram_id = $1',
    [tg.id]
  );
  if (!rows[0] || !rows[0].is_active) {
    return res.status(404).json({ error: 'Bog‘langan hisob topilmadi', code: 'NOT_LINKED' });
  }
  res.json({ token: signToken(rows[0]), user: publicUser(rows[0]) });
});

// POST /api/auth/change-password  { old_password, new_password }
router.post('/change-password', authenticate, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Yangi parol kamida 8 belgidan iborat bo‘lsin' });
  }

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  const ok = await verifyPassword(old_password || '', rows[0].password_hash);
  if (!ok) {
    return res.status(400).json({
      error: req.user.must_change_password ? 'Vaqtinchalik parol noto‘g‘ri' : 'Eski parol noto‘g‘ri',
    });
  }

  await query(
    'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
    [await hashPassword(new_password), req.user.id]
  );
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;

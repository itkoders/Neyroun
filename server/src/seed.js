import 'dotenv/config';
import { pool } from './db.js';
import { hashPassword } from './auth.js';

/**
 * Birinchi asosiy admin yaratadi. Faqat bitta marta ishlatiladi.
 * ADMIN_LOGIN va ADMIN_PASSWORD Render maxfiy sozlamalarida saqlanadi.
 */
const login = process.env.ADMIN_LOGIN;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME || 'Asosiy admin';

try {
  if (!login || !password || password.length < 12) {
    throw new Error('ADMIN_LOGIN va kamida 12 belgili ADMIN_PASSWORD kerak');
  }

  const { rows } = await pool.query(
    'SELECT 1 FROM users WHERE role = $1 LIMIT 1',
    ['admin']
  );

  if (rows.length) {
    console.log('Admin allaqachon mavjud, hech narsa o‘zgartirilmadi');
  } else {
    await pool.query(
      `INSERT INTO users (role, login, password_hash, full_name, must_change_password)
       VALUES ('admin', $1, $2, $3, TRUE)`,
      [login, await hashPassword(password), fullName]
    );
    console.log(`Admin yaratildi: ${login}`);
  }
} finally {
  await pool.end();
}

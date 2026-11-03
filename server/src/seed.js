import 'dotenv/config';
import { pool } from './db.js';
import { hashPassword } from './auth.js';

/**
 * Birinchi asosiy admin yaratadi. Faqat bitta marta ishlatiladi.
 *   ADMIN_LOGIN=admin ADMIN_PASSWORD='kuchli-parol' npm run seed
 */
const login = process.env.ADMIN_LOGIN;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME || 'Asosiy admin';

if (!login || !password || password.length < 8) {
  console.error('ADMIN_LOGIN va ADMIN_PASSWORD (kamida 8 belgi) kerak');
  process.exit(1);
}

const { rows } = await pool.query('SELECT 1 FROM users WHERE role = $1 LIMIT 1', ['admin']);
if (rows.length) {
  console.log('Admin allaqachon mavjud, hech narsa o‘zgartirilmadi');
  await pool.end();
  process.exit(0);
}

await pool.query(
  `INSERT INTO users (role, login, password_hash, full_name, must_change_password)
   VALUES ('admin', $1, $2, $3, FALSE)`,
  [login, await hashPassword(password), fullName]
);
console.log(`Admin yaratildi: ${login}`);
await pool.end();

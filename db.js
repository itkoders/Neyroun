import pg from 'pg';
import 'dotenv/config';

const { Pool, types } = pg;

// DATE (oid 1082) ni JS Date emas, "YYYY-MM-DD" matn sifatida qaytarish —
// server vaqt zonasi bilan sana siljishining oldini oladi.
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

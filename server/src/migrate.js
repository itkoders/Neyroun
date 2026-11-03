import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from './db.js';
try {
  const sql = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Neuron database schema applied');
} finally {
  await pool.end();
}

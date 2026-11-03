import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from './db.js';

const version = '001_initial_schema';

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS neuron_schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const existing = await pool.query(
    'SELECT 1 FROM neuron_schema_migrations WHERE version = $1',
    [version]
  );

  if (existing.rowCount) {
    console.log('Neuron database schema already applied');
  } else {
    const sql = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(
        'INSERT INTO neuron_schema_migrations (version) VALUES ($1)',
        [version]
      );
      await pool.query('COMMIT');
      console.log('Neuron database schema applied');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await pool.end();
}

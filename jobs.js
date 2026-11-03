import { query } from './db.js';
import { lastWeekMonday } from './utils.js';

/** Ota-onalarga (tasdiqlangan) bildirishnoma yuborish navbatini yaratadi. */
async function notifyParentsOf(studentId, kind, payload) {
  await query(
    `INSERT INTO notifications (user_id, kind, payload)
     SELECT parent_id, $2, $3::jsonb
     FROM parent_student_links
     WHERE student_id = $1 AND status = 'approved'`,
    [studentId, kind, JSON.stringify(payload)]
  );
}

/**
 * Muddati o'tgan to'lovlarni 'overdue' qiladi va o'qituvchi + ota-onaga
 * bildirishnoma yaratadi. Jarimani bu funksiya qo'ymaydi — faqat o'qituvchi.
 */
export async function markOverdue() {
  const { rows } = await query(
    `UPDATE payments p SET status = 'overdue'
     FROM payment_plans pl
     WHERE pl.id = p.plan_id
       AND p.status = 'unpaid'
       AND (p.period_month + (pl.due_day - 1)) < CURRENT_DATE
     RETURNING p.id, p.period_month, pl.teacher_id, pl.student_id`
  );

  for (const r of rows) {
    const payload = { payment_id: r.id, period: r.period_month };
    await query(
      `INSERT INTO notifications (user_id, kind, payload) VALUES ($1, 'overdue', $2::jsonb)`,
      [r.teacher_id, JSON.stringify(payload)]
    );
    await notifyParentsOf(r.student_id, 'overdue', payload);
  }
  return rows.length;
}

/**
 * Berilgan haftaning (dushanba) eng yaxshi 5 o'quvchisini aniqlaydi va
 * 👑 toj jadvaliga yozadi. Idempotent: hafta uchun qayta yozilmaydi.
 */
export async function computeWeeklyCrowns(weekStart) {
  const existing = await query('SELECT 1 FROM weekly_crowns WHERE week_start = $1::date LIMIT 1', [weekStart]);
  if (existing.rows.length) return 0;

  const { rows } = await query(
    `SELECT gr.student_id,
            ROUND(AVG(gr.score), 2)::float8 AS avg_score
     FROM grades gr
     JOIN students s ON s.id = gr.student_id AND s.is_active
     WHERE gr.lesson_date >= $1::date AND gr.lesson_date < $1::date + 7
     GROUP BY gr.student_id
     ORDER BY avg_score DESC, COUNT(*) DESC
     LIMIT 5`,
    [weekStart]
  );

  for (let i = 0; i < rows.length; i++) {
    const rank = i + 1;
    await query(
      `INSERT INTO weekly_crowns (week_start, rank, student_id, avg_score)
       VALUES ($1::date, $2, $3, $4)`,
      [weekStart, rank, rows[i].student_id, rows[i].avg_score]
    );
    await notifyParentsOf(rows[i].student_id, 'crown', {
      week_start: weekStart,
      rank,
      avg_score: rows[i].avg_score,
    });
  }
  return rows.length;
}

/** Soatiga bir marta ishlaydi; hammasi idempotent. */
export function startJobs() {
  const run = async () => {
    try {
      const overdue = await markOverdue();
      const crowns = await computeWeeklyCrowns(lastWeekMonday());
      if (overdue || crowns) console.log(`[jobs] overdue=${overdue} crowns=${crowns}`);
    } catch (err) {
      console.error('[jobs] xatolik:', err);
    }
  };
  run();
  return setInterval(run, 60 * 60 * 1000);
}

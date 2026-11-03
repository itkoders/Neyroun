import { InputFile } from 'grammy';
import { query } from '../db.js';
import { renderGradeCard } from './card.js';
import { synthesizeSpeech } from '../tts.js';

/** Bildirishnoma turiga qarab Telegram xabari (matn, rasm, ovoz) tuzadi. */
async function buildMessage(n) {
  const p = n.payload || {};

  if (n.kind === 'grade' || n.kind === 'low_score') {
    const { rows } = await query(
      `SELECT s.full_name, sub.name AS subject, g.name AS group_name, gr.score,
              to_char(gr.lesson_date, 'YYYY-MM-DD') AS lesson_date
       FROM grades gr
       JOIN students s ON s.id = gr.student_id
       JOIN subjects sub ON sub.id = gr.subject_id
       LEFT JOIN groups g ON g.id = s.group_id
       WHERE gr.id = $1`,
      [p.grade_id]
    );
    const r = rows[0];
    if (!r) return null;

    const photo = renderGradeCard({
      studentName: r.full_name,
      subject: r.subject,
      score: r.score,
      date: r.lesson_date,
      groupName: r.group_name,
    });
    const low = n.kind === 'low_score';
    return {
      text: `${low ? '⚠️' : '📝'} ${r.full_name} — ${r.subject}\nBall: ${r.score}/100\nSana: ${r.lesson_date}`,
      photo,
      voiceText: low
        ? `${r.full_name}, ${r.subject} fanidan ball ${r.score}. Iltimos, e'tibor bering.`
        : null,
    };
  }

  if (n.kind === 'overdue') {
    const { rows } = await query(
      `SELECT s.full_name, to_char(p.period_month, 'YYYY-MM') AS period
       FROM payments p JOIN payment_plans pl ON pl.id = p.plan_id JOIN students s ON s.id = pl.student_id
       WHERE p.id = $1`,
      [p.payment_id]
    );
    const r = rows[0];
    return r ? { text: `⏰ ${r.full_name}: ${r.period} oyi uchun to‘lov muddati o‘tdi.` } : null;
  }

  if (n.kind === 'penalty') {
    return { text: `⚠️ Kechikish uchun jarima qo‘shildi: ${Number(p.amount).toLocaleString('en-US')} so‘m.` };
  }

  if (n.kind === 'crown') {
    const { rows } = await query(
      `SELECT s.full_name FROM weekly_crowns wc JOIN students s ON s.id = wc.student_id
       WHERE wc.week_start = $1::date AND wc.rank = $2`,
      [p.week_start, p.rank]
    );
    const name = rows[0]?.full_name ?? 'O‘quvchi';
    return { text: `👑 Haftaning ${p.rank}-o‘quvchisi: ${name} (o‘rtacha ${p.avg_score})` };
  }

  return null;
}

/** Yuborilmagan bildirishnomalarni Telegram'ga jo'natadi (outbox). */
export async function flushNotifications(bot) {
  const { rows } = await query(
    `SELECT n.id, n.kind, n.payload, u.telegram_id
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     WHERE n.sent_at IS NULL AND u.telegram_id IS NOT NULL AND n.attempts < 5
     ORDER BY n.id
     LIMIT 40`
  );

  for (const n of rows) {
    const chatId = Number(n.telegram_id);
    try {
      const msg = await buildMessage(n);
      if (msg?.photo) {
        await bot.api.sendPhoto(chatId, new InputFile(msg.photo, 'card.png'), { caption: msg.text });
      } else if (msg) {
        await bot.api.sendMessage(chatId, msg.text);
      }

      if (msg?.voiceText) {
        const audio = await synthesizeSpeech(msg.voiceText).catch((err) => {
          console.error('[tts]', err.message);
          return null;
        });
        if (audio) await bot.api.sendVoice(chatId, new InputFile(audio, 'warning.mp3'));
      }

      await query('UPDATE notifications SET sent_at = now() WHERE id = $1', [n.id]);
    } catch (err) {
      await query(
        'UPDATE notifications SET attempts = attempts + 1, last_error = $2 WHERE id = $1',
        [n.id, String(err.message).slice(0, 500)]
      );
    }
  }
}

export function startNotifier(bot, intervalMs = 20_000) {
  return setInterval(() => {
    flushNotifications(bot).catch((err) => console.error('[notifier]', err));
  }, intervalMs);
}

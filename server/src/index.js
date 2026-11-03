import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import 'express-async-errors';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import teacherRoutes from './routes/teacher.js';
import parentRoutes from './routes/parent.js';
import commonRoutes from './routes/common.js';
import { startJobs } from './jobs.js';
import { createBot } from './bot/index.js';
import { startNotifier } from './bot/notifier.js';

const app = express();
app.use(cors({ origin: process.env.WEBAPP_ORIGIN || false }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'neuron' }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api', commonRoutes);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Ichki server xatosi' });
});
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Neuron API listening on ${port}`);
  if (process.env.DISABLE_JOBS !== '1') startJobs();
  if (process.env.BOT_TOKEN) {
    const bot = createBot(process.env.BOT_TOKEN);
    bot.start({ drop_pending_updates: true }).catch((err) => console.error('[bot] start:', err));
    startNotifier(bot);
    console.log('Telegram bot ishga tushdi');
  } else console.log('BOT_TOKEN yo‘q — Telegram bot o‘chirilgan');
});

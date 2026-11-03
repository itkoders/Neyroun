import { Bot, InlineKeyboard } from 'grammy';

/** Telegram bot: /start buyrug'i Mini App'ni ochadi. Bildirishnomalar notifier orqali yuboriladi. */
export function createBot(token) {
  const bot = new Bot(token);

  bot.command('start', async (ctx) => {
    const url = process.env.WEBAPP_URL;
    const text =
      'Assalomu alaykum! 🧠 Neuron — ota-ona, o‘qituvchi va admin uchun ilova.\n' +
      'Ilovani oching va login/parol bilan kiring.';

    if (!url) return ctx.reply(text);
    const keyboard = new InlineKeyboard().webApp('Neuron ochish', url);
    await ctx.reply(text, { reply_markup: keyboard });
  });

  bot.catch((err) => console.error('[bot]', err.error ?? err));
  return bot;
}

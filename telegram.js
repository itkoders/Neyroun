const tg = window.Telegram?.WebApp;

/** Mini App'ni tayyorlaydi: to'liq ekran, qorong'i mavzu. Brauzerda ham xavfsiz ishlaydi. */
export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('#0b0620');
  tg.setBackgroundColor?.('#0b0620');
}

export const getInitData = () => tg?.initData || '';

export function haptic(style = 'light') {
  tg?.HapticFeedback?.impactOccurred(style);
}

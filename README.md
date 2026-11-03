# Neuron

Repititor markazi uchun Telegram Mini App + bot. Ota-ona, o‘qituvchi va admin rollari bor.

## Tarkib

```
neuron/
├── db/schema.sql        PostgreSQL sxemasi
├── server/              Express API + Telegram bot (grammY) + cron ishlari
└── webapp/              React + Vite Mini App
```

## Ishga tushirish

### 1. Ma'lumotlar bazasi

```bash
createdb neuron
psql "postgres://localhost/neuron" -f db/schema.sql
```

### 2. Server

```bash
cd server
npm install
cp .env.example .env        # DATABASE_URL, JWT_SECRET, BOT_TOKEN ni to'ldiring
ADMIN_LOGIN=admin ADMIN_PASSWORD='kuchli-parol' npm run seed   # birinchi admin (bir marta)
npm start
```

`.env` kalitlari:

| Kalit | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanishi |
| `JWT_SECRET` | Uzun tasodifiy qator |
| `BOT_TOKEN` | @BotFather bergan token. Bo'lmasa bot o'chiq turadi |
| `WEBAPP_URL` | Mini App manzili (HTTPS). `/start` tugmasi shunga ochiladi |
| `WEBAPP_ORIGIN` | CORS uchun, odatda `WEBAPP_URL` bilan bir xil |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Ixtiyoriy. 50 dan past ball ovozli ogohlantirishi uchun. Bo'lmasa faqat matn yuboriladi |

### 3. Mini App

```bash
cd webapp
npm install
npm run dev        # ishlab chiqish, /api ni localhost:4000 ga yo'naltiradi
npm run build      # dist/ — HTTPS hostingga joylang
```

Ishlab chiqarishda `VITE_API_URL=https://api.sizning-domen.uz/api` bilan build qiling.

### 4. Telegram sozlamasi

1. @BotFather → botni yarating, tokenni `.env` ga qo'ying.
2. @BotFather → `/setdomain` yoki Mini App URL'ini `WEBAPP_URL` ga bog'lang.

## Ish jarayoni

1. **Admin** o'qituvchi yoki ota-ona hisobini yaratadi va vaqtinchalik login/parol beradi.
2. Foydalanuvchi kiradi va birinchi kirishda parolni almashtiradi.
3. **Ota-ona** farzandini qidiradi va so'rov yuboradi. Admin tasdiqlaydi (bir ota-onaga 3 tadan ko'p emas).
4. **O'qituvchi** guruh va fan yaratadi, fanni guruhga biriktiradi, o'quvchi qo'shadi, jurnalga ball qo'yadi.
   - Ball 0–100. 50 dan past bo'lsa ota-onaga ovozli ogohlantirish boradi.
   - Har ball kartochka rasmi sifatida botga yuboriladi.
5. **Oylik to'lov**: o'qituvchi summa va muddat belgilaydi, oy boshida to'lovlarni yaratadi, naqd to'lovni qayd etadi.
   - Muddat o'tsa, tizim o'qituvchi va ota-onaga xabar beradi.
   - **Jarimani faqat o'qituvchi qo'lda qo'yadi.**
6. **Haftalik 👑**: har dushanba, o'tgan haftaning eng yaxshi 5 o'quvchisi avtomatik aniqlanadi va ota-onalarga xabar boradi.

## Rollar

| Rol | Imkoniyatlari |
|---|---|
| Admin | O'qituvchi/ota-ona hisoblari, so'rovlarni tasdiqlash |
| O'qituvchi | Guruh, fan, o'quvchi, jurnal, to'lov, jarima, statistika |
| Ota-ona | Farzand jurnali, diagramma, to'lovlar, reyting, farzand so'rovi |

## Eslatma

- Sinov uchun `DISABLE_JOBS=1` bilan cron ishlarini o'chirish mumkin.
- Ishlab chiqarishdan oldin `JWT_SECRET` va admin parolini albatta almashtiring.

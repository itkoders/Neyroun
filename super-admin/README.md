# ITKODERS SUPER ADMIN

Markaziy boshqaruv paneli. Asosiy NEURON fayllariga tegmaslik uchun alohida papka va alohida Render xizmati sifatida joylashtiriladi.

## Render sozlamalari
- Root directory: super-admin
- Runtime: Docker
- Dockerfile: Dockerfile
- Health path: /health
- Environment: DATABASE_URL, SECRET_KEY (32+ belgili tasodifiy), BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD (16+ belgi), COOKIE_SECURE=true, RENDER_API_KEY (deploy boshqaruvi uchun ixtiyoriy).

## Eslatma
Render API kaliti va parol faqat maxfiy Environment Variables ichida saqlansin. Hech qachon GitHub kodiga joylanmasin.

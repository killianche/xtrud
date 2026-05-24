# xtrud landing — статичный сайт для xtrud.ru

Минимальный landing для домена `xtrud.ru`. Цель:
- быть **Marketing URL** в App Store Connect / Google Play Console;
- быть **Support URL** (страница `/support`);
- зеркалить **Privacy Policy** + **Terms of Service** на web (Apple/Google reviewer открывает URL без app);
- работать на любом статик-хостинге без бэкенда.

## Структура

```
landing/
├── index.html       # главная: оффер, как это работает, доверие
├── support.html     # /support — контакты поддержки
├── privacy.html     # /privacy — TODO: зеркало app/legal/privacy.tsx
├── terms.html       # /terms — TODO: зеркало app/legal/terms.tsx
└── favicon.ico      # TODO: положить из assets/images/favicon.png
```

`privacy.html` и `terms.html` нужно сгенерировать (или вручную переписать)
из текста в `app/legal/privacy.tsx` и `app/legal/terms.tsx`. Текст одинаковый.

## Деплой

Любой статик-хостинг работает: **Cloudflare Pages** (бесплатно), **Vercel**, **Netlify**, **GitHub Pages**, или Yandex/VK Cloud Storage с CDN. Шаги:

1. Купить домен `xtrud.ru` (рекламные регистраторы — REG.ru, NIC.ru, Cloudflare Registrar).
2. Подключить DNS (либо native у регистратора, либо Cloudflare DNS).
3. Деплой папки `landing/` — drag-and-drop в Cloudflare Pages, или `vercel --prod` в этой папке.
4. Настроить redirect/rewrite:
   - `/privacy` → `/privacy.html`
   - `/terms` → `/terms.html`
   - `/support` → `/support.html`

   Cloudflare Pages: создать файл `_redirects` в корне:
   ```
   /privacy /privacy.html 200
   /terms /terms.html 200
   /support /support.html 200
   ```

5. Зарегистрировать email `support@xtrud.ru` (forwarding на личный или через ImproveMX, ForwardEmail.net).

## Что отсутствует и нужно сделать

- [ ] **privacy.html** — извлечь текст из `app/legal/privacy.tsx`.
- [ ] **terms.html** — извлечь текст из `app/legal/terms.tsx`.
- [ ] **favicon.ico** — скопировать из `assets/images/favicon.png`.
- [ ] **og.png** — 1200×630 OG-картинка с логотипом для соцсетей. Дизайнерская работа.
- [ ] Финальные ссылки на App Store / Google Play — заменить `href="#"` на реальные после публикации.

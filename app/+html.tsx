import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Web-only HTML shell, см. CROSS_PLATFORM_RULES.md правила 10 и 17.
// 1. Viewport-fit=cover — фикс «мелкого iOS Safari» на мобильном web.
// 2. Inline theme-guard script — устраняет flash of wrong theme при гидрации.
//    Читает localStorage('xtrud-theme') (Zustand persist JSON), резолвит preference
//    в light/dark и ставит class="dark" на <html> ДО первого рендера body.
//    Это устраняет SSR colorScheme race — после этого useColorScheme() может
//    спокойно опираться на тот же store без DOM/matchMedia-фолбэков.
//
// Этот файл рендерится ТОЛЬКО на web build, см. https://docs.expo.dev/router/reference/static-rendering/

const themeGuardScript = `
(function () {
  try {
    var raw = localStorage.getItem('xtrud-theme');
    var pref = 'system';
    if (raw) {
      // Zustand persist format: { state: { preference: 'dark' }, version: 1 }
      var parsed = JSON.parse(raw);
      pref = (parsed && parsed.state && parsed.state.preference) || 'system';
    }
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = pref === 'dark' || (pref === 'system' && prefersDark);
    if (dark) document.documentElement.classList.add('dark');
  } catch (_) { /* SSR / no localStorage / parse error — ничего не делаем */ }
})();
`;

// html/body фоны — заходят за safe-area (на iPhone X+ это area под notch и
// home-indicator). При overscroll bounce и pull-to-refresh виден этот цвет,
// поэтому он должен совпадать с canvas-токеном.
const responsiveBackground = `
html, body { background-color: #ffffff; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: #0a0a0a; }
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        {/* Заголовок вкладки браузера. Статичный — это название сайта. */}
        <title>xtrud</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* theme-color — Safari iOS красит address-bar и notch-area в этот цвет.
            Прописываем два variant'а: light/dark — Safari подхватит активный
            автоматически по prefers-color-scheme. */}
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        {/* iOS standalone (Add to Home Screen): чёрная статус-бар тема,
            прозрачная — наш canvas-color виден сквозь неё. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <ScrollViewStyleReset />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme guard для устранения FOUC */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: inline theme guard ДО body */}
        <script dangerouslySetInnerHTML={{ __html: themeGuardScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Статическая сборка: результат кладётся на admin.xtrud.pro как обычные файлы.
// Никакого сервера у панели нет — см. docs/ADMIN_PANEL.md §5.
export default defineConfig({
  // Панель живёт по адресу xtrud.pro/admin/. Отдельный поддомен потребовал бы
  // записи DNS и второго сертификата; путь работает сразу и на том же
  // сертификате. Переезд на admin.xtrud.pro — сменить base на "/".
  base: "/admin/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
});

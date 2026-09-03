import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Статическая сборка: результат кладётся на admin.xtrud.pro как обычные файлы.
// Никакого сервера у панели нет — см. docs/ADMIN_PANEL.md §5.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
});

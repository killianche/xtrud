// Настройки панели читаются во время работы из /config.json, а не вшиваются
// в бандл. Так один и тот же собранный файл переносится между окружениями, а
// смена адреса API не требует пересборки.
//
// В config.json попадает ТОЛЬКО то, что и так лежит в опубликованном
// iOS-приложении: адрес API и публичный ключ. Сервисный ключ здесь не
// появляется никогда — у него обход RLS, то есть отсутствие прав доступа как
// понятия (docs/ADMIN_PANEL.md §6).

export interface AdminConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

let cached: AdminConfig | null = null;

export async function loadConfig(): Promise<AdminConfig> {
  if (cached) return cached;

  const response = await fetch("/config.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Не найден /config.json. Панель не знает адрес API — проверьте выкладку.");
  }
  const raw: unknown = await response.json();
  const parsed = raw as Partial<AdminConfig>;
  if (!parsed.supabaseUrl || !parsed.supabaseAnonKey) {
    throw new Error("В /config.json нет supabaseUrl или supabaseAnonKey.");
  }
  cached = { supabaseUrl: parsed.supabaseUrl, supabaseAnonKey: parsed.supabaseAnonKey };
  return cached;
}

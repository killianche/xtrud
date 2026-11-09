// Что включено на сервере для входа (GET /v2/auth/options): спрашивать ли
// подтверждение номера звонком при регистрации (№206), включён ли вход по
// паролю (№380, с 2026-11-09 выключен). Сервер — источник правды:
// включается на сервере, без новой сборки.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/** Свежий ответ перед регистрацией — настройка могла смениться. */
export function fetchAuthOptions() {
  return supabase.auth.options();
}

/**
 * Спрашивать ли пароль. Пока ответа нет — нет: пароль выключен (№380), а
 * поле, которое мелькнуло и пропало, хуже его отсутствия.
 */
export function usePasswordLogin(): boolean {
  const q = useQuery({
    queryKey: ["auth-options"],
    queryFn: fetchAuthOptions,
    staleTime: 5 * 60_000,
  });
  return q.data?.passwordLogin === true;
}

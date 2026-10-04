// Что включено на сервере для входа (2026-10-04): спрашивать ли код из SMS
// при регистрации и можно ли сменить пароль по SMS. Сервер — источник
// правды: код при регистрации включается одной настройкой, когда у
// отправителя подключены все операторы, без новой сборки.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useAuthOptions() {
  return useQuery({
    queryKey: ["auth-options"],
    queryFn: () => supabase.auth.options(),
    staleTime: 10 * 60_000,
  });
}

/** Свежий ответ перед действием — настройка могла смениться, пока экран открыт. */
export function fetchAuthOptions() {
  return supabase.auth.options();
}

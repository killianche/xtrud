// Заявка на значок «Большой опыт» (0246, №318,
// docs/BADGE_REQUESTS_2026-10.md): специалист рассказывает об опыте и
// оставляет WhatsApp, администратор связывается, проверяет и выдаёт значок.
// Функции базы без генерированных типов — вызов с явной формой ответа.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ExperienceBadgeStatus = "none" | "pending" | "approved" | "rejected";

export interface MyExperienceBadge {
  status: ExperienceBadgeStatus;
  about: string | null;
  whatsapp: string | null;
  reason: string | null;
  granted_at: string | null;
}

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as UntypedRpc)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const KEY = ["my-experience-badge"] as const;

/** Границы текста — те же, что проверяет база. */
export const ABOUT_MIN = 20;
export const ABOUT_MAX = 1000;

export const EXPERIENCE_BADGE_STATUS_TEXT: Record<ExperienceBadgeStatus, string> = {
  none: "Нет",
  pending: "На проверке",
  approved: "Есть",
  rejected: "Не выдан",
};

export function useMyExperienceBadge(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => rpc<MyExperienceBadge>("my_experience_badge_request"),
  });
}

export function useSubmitExperienceBadge() {
  const qc = useQueryClient();
  return useMutation<MyExperienceBadge, Error, { about: string; whatsapp: string }>({
    mutationFn: (v) =>
      rpc<MyExperienceBadge>("submit_experience_badge_request", {
        p_about: v.about,
        p_whatsapp: v.whatsapp,
      }),
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}

/** Понятный текст ошибки сервера. */
export function experienceBadgeErrorText(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m.includes("bad_about"))
    return `Расскажите об опыте: от ${ABOUT_MIN} до ${ABOUT_MAX} символов.`;
  if (m.includes("bad_whatsapp")) return "Проверьте номер WhatsApp.";
  if (m.includes("already_granted")) return "Значок у вас уже есть.";
  if (m.includes("rate_limited")) return "Слишком много заявок за сутки. Попробуйте завтра.";
  return "Не удалось отправить. Попробуйте ещё раз.";
}

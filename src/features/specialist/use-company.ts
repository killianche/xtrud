// Компания специалиста и её подтверждение (0245, №308,
// docs/COMPANY_VERIFICATION_2026-10.md). Функции базы без генерированных
// типов — вызов с явной формой ответа.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type CompanyStatus = "none" | "pending" | "approved" | "rejected";

export interface MyCompany {
  account_type: "solo" | "brigade" | "company";
  status: CompanyStatus;
  legal_name: string | null;
  instagram: string | null;
  whatsapp: string | null;
  inn: string | null;
  reason: string | null;
  verified_at: string | null;
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

const KEY = ["my-company"] as const;

export function useMyCompany(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => rpc<MyCompany>("my_company_verification"),
  });
}

function useCompanyMutation<V>(call: (v: V) => Promise<MyCompany>) {
  const qc = useQueryClient();
  return useMutation<MyCompany, Error, V>({
    mutationFn: call,
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      void qc.invalidateQueries({ queryKey: ["master-public"] });
      void qc.invalidateQueries({ queryKey: ["search-masters"] });
    },
  });
}

/** «Частный мастер» / «Компания» и название — без проверки. */
export function useSetAccountType() {
  return useCompanyMutation((v: { type: "solo" | "company"; legalName: string | null }) =>
    rpc<MyCompany>("set_account_type", { p_type: v.type, p_legal_name: v.legalName }),
  );
}

/** Заявка «Подтвердить компанию». */
export function useSubmitCompany() {
  return useCompanyMutation(
    (v: { legalName: string; instagram: string; whatsapp: string; inn: string | null }) =>
      rpc<MyCompany>("submit_company_verification", {
        p_legal_name: v.legalName,
        p_instagram: v.instagram,
        p_whatsapp: v.whatsapp,
        p_inn: v.inn,
      }),
  );
}

/** Понятный текст ошибки сервера. */
export function companyErrorText(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (m.includes("bad_legal_name"))
    return "Название — от 2 до 80 символов: буквы, цифры и обычные знаки, без значков и слов «подтверждено», «официальный», «xtrud».";
  if (m.includes("bad_instagram")) return "Проверьте Instagram: латиница, цифры, точка и «_».";
  if (m.includes("bad_whatsapp")) return "Проверьте номер WhatsApp.";
  if (m.includes("bad_inn")) return "ИНН — 10 или 12 цифр.";
  if (m.includes("rate_limited")) return "Слишком много заявок за сутки. Попробуйте завтра.";
  return "Не удалось сохранить. Попробуйте ещё раз.";
}

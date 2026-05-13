/**
 * Hooks для социального графа (Sprint I.8).
 *
 *  - useCommonContactsCount(otherUserId) — «у вас N общих знакомых»
 *  - useVouchesCount(targetUserId) — «N поручительств»
 *  - useMyVouchFor(targetUserId) — я уже поручился за него?
 *  - useToggleVouch — поставить/снять поручительство
 *  - useImportContacts — батч-инсерт из телефонной книги (call site сам
 *    запрашивает permission через expo-contacts и нормализует phone)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function commonContactsKey(otherUserId: string | undefined) {
  return ["common-contacts", otherUserId] as const;
}
export function vouchesCountKey(targetUserId: string | undefined) {
  return ["vouches-count", targetUserId] as const;
}
export function myVouchKey(voucherId: string | undefined, voucheeId: string | undefined) {
  return ["my-vouch", voucherId, voucheeId] as const;
}

export function useCommonContactsCount(otherUserId: string | null | undefined) {
  return useQuery<number>({
    queryKey: commonContactsKey(otherUserId ?? undefined),
    queryFn: async () => {
      if (!otherUserId) return 0;
      const { data, error } = await supabase.rpc("count_common_contacts_with", {
        p_other_user_id: otherUserId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!otherUserId,
    staleTime: 60_000,
  });
}

export function useVouchesCount(targetUserId: string | null | undefined) {
  return useQuery<number>({
    queryKey: vouchesCountKey(targetUserId ?? undefined),
    queryFn: async () => {
      if (!targetUserId) return 0;
      const { data, error } = await supabase.rpc("count_vouches_for", {
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: !!targetUserId,
    staleTime: 30_000,
  });
}

export function useMyVouchFor(voucherId: string | null | undefined, voucheeId: string | null | undefined) {
  return useQuery<boolean>({
    queryKey: myVouchKey(voucherId ?? undefined, voucheeId ?? undefined),
    queryFn: async () => {
      if (!voucherId || !voucheeId) return false;
      const { count, error } = await supabase
        .from("vouches")
        .select("id", { count: "exact", head: true })
        .eq("voucher_id", voucherId)
        .eq("vouchee_id", voucheeId);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    enabled: !!voucherId && !!voucheeId && voucherId !== voucheeId,
    staleTime: 30_000,
  });
}

export function useToggleVouch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      voucherId: string;
      voucheeId: string;
      currentlyVouched: boolean;
      comment?: string;
    }) => {
      if (input.currentlyVouched) {
        const { error } = await supabase
          .from("vouches")
          .delete()
          .eq("voucher_id", input.voucherId)
          .eq("vouchee_id", input.voucheeId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("vouches").insert({
          voucher_id: input.voucherId,
          vouchee_id: input.voucheeId,
          comment: input.comment?.trim() || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: myVouchKey(vars.voucherId, vars.voucheeId) });
      qc.invalidateQueries({ queryKey: vouchesCountKey(vars.voucheeId) });
    },
  });
}

/**
 * Импорт контактов. Call site:
 *   1. expo-contacts permission + Contacts.getContactsAsync
 *   2. Нормализовать phones в E.164 (+7XXXXXXXXXX)
 *   3. Передать в useImportContacts.mutate(contacts)
 */
export function useImportContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      contacts: { phone: string; name?: string }[];
    }) => {
      // Сначала чистим прошлый импорт чтобы избежать stale records
      const { error: delErr } = await supabase
        .from("user_contacts")
        .delete()
        .eq("user_id", input.userId);
      if (delErr) throw delErr;

      if (input.contacts.length === 0) return 0;

      const rows = input.contacts.map((c) => ({
        user_id: input.userId,
        phone_normalized: c.phone,
        display_name: c.name?.slice(0, 200) || null,
      }));

      // Batch insert по 100 за раз чтобы не упереться в лимиты
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await supabase.from("user_contacts").insert(batch);
        if (error) throw error;
      }
      return rows.length;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["common-contacts"] });
    },
  });
}

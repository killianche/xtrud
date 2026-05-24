/**
 * Mutation: редактирование уже-существующего master profile.
 *
 * Onboarding-create живёт через RPC `complete_master_onboarding` (Sprint 3.3),
 * она ставит `onboarding_completed_at`. После онбординга владелец редактирует
 * поля через простой UPDATE — два запроса:
 *  - users.first_name/last_name/city_id/district
 *  - master_profiles.bio/experience_years/has_tools/has_transport
 *
 * Не объединяем в один RPC — sprint 9 минимум, нужен ли единый transactional
 * UPDATE — пока нет, поля редактируются вместе с UI. Если будут race conditions
 * между UPDATE-ами — в Sprint 10 заведём RPC `update_master_profile`.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export interface UpdateMasterProfileInput {
  userId: string;
  firstName: string;
  lastName: string;
  cityId: string;
  district: string;
  bio: string;
  experienceYears: number;
  // Sprint 0079: WhatsApp.
  whatsappSameAsPhone: boolean;
  /** Пустая строка = не указан. Игнорируется если whatsappSameAsPhone=true. */
  whatsappPhone: string;
  // Sprint 2026-05-20 (миграция 0097): contact_phone.
  contactSameAsPhone: boolean;
  /** Пустая строка = не указан. Если contactSameAsPhone=true — пишем NULL. */
  contactPhone: string;
}

export function useUpdateMasterProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMasterProfileInput) => {
      // Sprint 2026-05-20 (миграция 0097): contact_phone.
      //   contactSameAsPhone=true → NULL → читается через COALESCE на бэке.
      //   contactSameAsPhone=false → trimmed value (или NULL если пусто).
      const trimmedContact = input.contactPhone.trim();
      const finalContactPhone = input.contactSameAsPhone
        ? null
        : trimmedContact === ""
          ? null
          : trimmedContact;

      const { error: usersErr } = await supabase
        .from("users")
        .update({
          first_name: input.firstName,
          last_name: input.lastName,
          city_id: input.cityId,
          district: input.district || null,
          // contact_phone — миграция 0097, типы регенерятся следующим
          // generate_typescript_types. Каст until then.
          contact_phone: finalContactPhone,
        } as never)
        .eq("id", input.userId);
      if (usersErr) throw usersErr;

      // Sprint 0079: WhatsApp. constraint master_profiles_whatsapp_xor:
      // same=true ⟹ phone NULL. Trim + empty → NULL.
      const trimmed = input.whatsappPhone.trim();
      const whatsappPhone =
        input.whatsappSameAsPhone || trimmed === "" ? null : trimmed;

      // has_tools / has_transport — legacy поля (удалены из UI 2026-05-19),
      // не пишем — оставляем существующее значение в БД.
      const { error: profileErr } = await supabase
        .from("master_profiles")
        .update({
          bio: input.bio || null,
          experience_years: input.experienceYears,
          whatsapp_same_as_phone: input.whatsappSameAsPhone,
          whatsapp_phone: whatsappPhone,
        })
        .eq("user_id", input.userId);
      if (profileErr) throw profileErr;
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: userRecordKey(userId) });
      queryClient.invalidateQueries({ queryKey: ["master-profile", userId] });
      queryClient.invalidateQueries({ queryKey: ["master-public", userId] });
    },
  });
}

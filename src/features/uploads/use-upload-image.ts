/**
 * TanStack Query mutation hooks для загрузки изображений в Supabase Storage.
 *
 * Хуки тут НЕ обновляют доменные таблицы (master_profiles.avatar_url,
 * portfolio_items). Они только pick + resize + upload, возвращают
 * { path, publicUrl }. Caller сам обновляет соответствующую запись и
 * инвалидирует свои кэши — это разделяет ответственность storage / domain.
 *
 * Sprint 8.2 поверх этого построит useUpdateMasterAvatar /
 * useAddPortfolioItem.
 */

import { useMutation } from "@tanstack/react-query";
import { pickResizeUploadAvatar, pickResizeUploadPortfolio } from "@/lib/image-upload";

export type UploadResult = { path: string; publicUrl: string };

export function useUploadAvatar(userId: string | null | undefined) {
  return useMutation<UploadResult | null, Error>({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("Не авторизованы");
      }
      return await pickResizeUploadAvatar(userId);
    },
  });
}

export function useUploadPortfolioImage(userId: string | null | undefined) {
  return useMutation<UploadResult | null, Error>({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("Не авторизованы");
      }
      return await pickResizeUploadPortfolio(userId);
    },
  });
}

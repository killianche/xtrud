// Хуки и хелперы для юзернеймов (стабильный публичный идентификатор @ingush).
//
// - normalizeUsername / isUsernameFormatValid — нормализация и проверка формата
//   на клиенте (без сети), синхронно с серверным CHECK (a-z 0-9 _ . , 3–30).
// - useUsernameAvailability — живая проверка «свободно/занято» через RPC
//   is_username_available, с задержкой (debounce), чтобы не дёргать сеть на
//   каждую букву.
// - useSetUsername — закрепление юзернейма за текущим пользователем (RPC
//   set_username). Закрепляется один раз; маппинг ошибок RPC в человеческий текст.
//
// USAGE: src/features/auth/UsernameField.tsx (онбординг — client-name, master-profile).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { userRecordKey } from "@/features/auth/use-user-record";
import { supabase } from "@/lib/supabase";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

/** Приводит ввод к каноничному виду: нижний регистр + убираем недопустимые символы. */
export function normalizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, USERNAME_MAX);
}

/** Проверка формата без сети (синхронно с серверным CHECK). */
export function isUsernameFormatValid(username: string): boolean {
  return USERNAME_RE.test(username);
}

/**
 * Живая проверка доступности с задержкой 400мс. Запрос идёт только если формат
 * валиден. Возвращает { available, isChecking }.
 */
export function useUsernameAvailability(username: string): {
  available: boolean | null;
  isChecking: boolean;
} {
  const formatValid = isUsernameFormatValid(username);

  // Debounce: значение, по которому реально делаем запрос, обновляется с задержкой.
  const [debounced, setDebounced] = useState(username);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(username), 400);
    return () => clearTimeout(t);
  }, [username]);

  const enabled = formatValid && debounced === username;

  const query = useQuery<boolean>({
    queryKey: ["username-available", debounced],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_username_available", {
        p_username: debounced,
      });
      if (error) throw error;
      return data ?? false;
    },
    enabled,
    staleTime: 30_000,
  });

  return {
    // null = ещё не проверяли (нет валидного ввода / ждём debounce).
    available: enabled && query.isSuccess ? query.data : null,
    isChecking: enabled && (query.isFetching || debounced !== username),
  };
}

/** Человеческое сообщение по коду ошибки RPC set_username. */
export function setUsernameErrorMessage(message: string): string {
  if (message.includes("username_taken")) return "Этот юзернейм уже занят.";
  if (message.includes("username_invalid"))
    return "Юзернейм: латиница, цифры, точка и _ (от 3 до 30 символов).";
  if (message.includes("username_already_set"))
    return "Юзернейм уже закреплён за аккаунтом и не меняется.";
  return message;
}

export function useSetUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      username,
    }: {
      username: string;
      /** userId — только для инвалидации кэша профиля. */
      userId: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc("set_username", {
        p_username: normalizeUsername(username),
      });
      if (error) throw error;
    },
    onSuccess: (_d, { userId }) => {
      qc.invalidateQueries({ queryKey: userRecordKey(userId) });
    },
  });
}

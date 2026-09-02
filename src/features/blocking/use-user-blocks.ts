/**
 * Хуки блокировки пользователей (UGC safety, App Store Guideline 1.2).
 *
 * Таблица `user_blocks` — миграция `supabase/migration-drafts/0124_user_blocking_core.sql`,
 * ПОКА НЕ ПРИМЕНЕНА к production БД (применение заблокировано промоушен-
 * контрактом, см. STATUS.md). До применения миграции запросы ниже будут падать
 * ошибкой «relation "user_blocks" does not exist» — это ожидаемо, не баг
 * клиента, и не повод имитировать таблицу на клиенте.
 *
 * - useBlockedUsers()       — список заблокированных текущим пользователем
 *   + join на public.users (имя, аватар, роль) для экрана /profile/blocked-users.
 * - useBlockUser()           — заблокировать (insert user_blocks).
 * - useUnblockUser()          — разблокировать (delete user_blocks).
 * - useBlockedUserIds()      — тот же список id, что и useBlockedUsers(), но
 *   как Set<string> — для клиентской фильтрации каталога, избранного и
 *   публичных профилей (см. комментарий у функции: почему это ОДНОСТОРОННИЙ
 *   набор и почему это не устранимо без нового серверного объекта).
 *
 * После успешной мутации — широкая инвалидация всего кэша
 * (queryClient.invalidateQueries() без ключа): блокировка/разблокировка —
 * редкое действие, а её последствия (видимость заказов/откликов/профилей)
 * размазаны по десяткам query key. Точечная инвалидация была бы неполной и
 * неоправданно дорогой в поддержке (решение владельца).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { supabase } from "@/lib/supabase";

export interface BlockedUserRow {
  blockedId: string;
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isMaster: boolean;
}

const BLOCKED_USERS_KEY = ["user-blocks", "my"] as const;

export function useBlockedUsers() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  return useQuery<BlockedUserRow[]>({
    queryKey: BLOCKED_USERS_KEY,
    queryFn: async () => {
      if (!userId) return [];

      // Шаг 1: id заблокированных, в порядке блокировки (новые сверху).
      const { data: blockRows, error: blockErr } = await supabase
        .from("user_blocks")
        .select("blocked_id, created_at")
        .eq("blocker_id", userId)
        .order("created_at", { ascending: false });
      if (blockErr) throw blockErr;
      if (!blockRows || blockRows.length === 0) return [];

      const ids = blockRows.map((r) => r.blocked_id);

      // Шаг 2: публичные поля users пачкой.
      const { data: usersRows, error: usersErr } = await supabase
        .from("users")
        .select("id, first_name, last_name, avatar_url, is_master")
        .in("id", ids);
      if (usersErr) throw usersErr;

      const userById = new Map((usersRows ?? []).map((u) => [u.id, u]));

      return blockRows
        .map((r) => {
          const u = userById.get(r.blocked_id);
          if (!u) return null;
          return {
            blockedId: r.blocked_id,
            createdAt: r.created_at,
            firstName: u.first_name ?? null,
            lastName: u.last_name ?? null,
            avatarUrl: u.avatar_url ?? null,
            isMaster: u.is_master,
          };
        })
        .filter((x): x is BlockedUserRow => x !== null);
    },
    enabled: !!userId,
    staleTime: 30_000,
    // До применения миграции 0124 запрос неизбежно падает («relation
    // "user_blocks" does not exist») — это не сетевая помеха, а отсутствующий
    // объект БД, и повторный запрос его не создаст. Глобальный default
    // (retry: 2 + backoff, app/_layout.tsx) в этом случае только держит
    // пользователя на скелетоне лишние секунды перед заведомым error-state.
    // Кнопка «Повторить» в error-state (см. blocked-users.tsx) даёт ручной
    // повтор, когда причина всё же временная (сеть).
    retry: false,
  });
}

/**
 * Id заблокированных текущим пользователем — как Set, для клиентской
 * фильтрации каталога, избранного и публичных профилей мастера/клиента
 * (app/(details)/master/[id].tsx, client/[id].tsx, use-master-public.ts,
 * use-client-public.ts, use-masters-by-l2.ts, use-top-masters.ts,
 * use-portfolio-cases.ts).
 *
 * ОДНОСТОРОННИЙ набор, и это не исправить без нового серверного объекта.
 * RLS-политика `user_blocks_select_own` отдаёт только строки, где текущий
 * пользователь — blocker (я его заблокировал); обратное («кто заблокировал
 * меня») запрос к таблице никогда не вернёт. Симметричный SECURITY DEFINER
 * helper xtrud_private.current_user_blocked_counterparties() из миграции
 * 0124 существует, но живёт НЕ в public-схеме и намеренно не выставлен через
 * PostgREST/Supabase Data API (комментарий "SCHEMA EXPOSURE" в самой
 * миграции) — он предназначен только для RLS-выражений на сервере, а не для
 * клиентских RPC-вызовов; выставить его наружу значило бы дать
 * заблокированному пользователю способ вычислить, кто именно его
 * заблокировал, а это ровно то, что RLS таблицы обязана скрывать.
 *
 * Следствие: клиент может спрятать в каталоге/избранном/профиле только тех,
 * кого заблокировал ОН САМ. Обратное (человек, который заблокировал меня, не
 * видит мой профиль в каталоге) на клиенте недостижимо в принципе — а не
 * временно, до какой-то будущей версии приложения. Это отражено в текстах
 * подтверждений блокировки (app/(details)/master/[id].tsx и рядом).
 */
export function useBlockedUserIds() {
  const blocked = useBlockedUsers();
  const data = useMemo(() => {
    if (!blocked.data) return undefined;
    return new Set(blocked.data.map((row) => row.blockedId));
  }, [blocked.data]);
  return { ...blocked, data };
}

/**
 * Убирает из списка элементы, чей id входит в набор заблокированных текущим
 * пользователем. Пока набор ещё не загружен (первый рендер сессии) или
 * запрос упал (таблица user_blocks до применения миграции 0124) — список не
 * режется: лучше на секунду показать то, что позже отфильтруется, чем
 * сломать каталог/избранное/ленту заведомой ошибкой сервера, которая сейчас
 * гарантирована. Чистая функция (не hook) — вызывающий сам решает, откуда
 * взять `blockedIds` (обычно useBlockedUserIds().data).
 */
export function excludeBlockedUsers<T>(
  items: T[] | undefined,
  blockedIds: Set<string> | undefined,
  getId: (item: T) => string,
): T[] | undefined {
  if (!items || !blockedIds || blockedIds.size === 0) return items;
  return items.filter((item) => !blockedIds.has(getId(item)));
}

export function useBlockUser() {
  const qc = useQueryClient();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  return useMutation({
    mutationFn: async (blockedId: string) => {
      if (!userId) throw new Error("Войдите в аккаунт, чтобы заблокировать пользователя.");
      if (userId === blockedId) throw new Error("Себя заблокировать нельзя.");
      const { error } = await supabase
        .from("user_blocks")
        .insert({ blocker_id: userId, blocked_id: blockedId });
      // Идемпотентность: 23505 = unique_violation (уже заблокирован) — не падаем.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useUnblockUser() {
  const qc = useQueryClient();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  return useMutation({
    mutationFn: async (blockedId: string) => {
      if (!userId) throw new Error("Войдите в аккаунт.");
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("blocker_id", userId)
        .eq("blocked_id", blockedId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

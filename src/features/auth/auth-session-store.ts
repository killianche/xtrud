// Состояние сессии Supabase — ОДИН общий источник на всё приложение.
//
// Было: хук useAuthSession держал собственный useState и заводил собственную
// пару getSession + onAuthStateChange. При 43 вызовах это 43 независимые копии
// состояния, каждая из которых стартует с status "loading" и сама читает
// сессию из защищённого хранилища.
//
// Цена была не теоретической. supabase-js не кэширует getSession в памяти:
// каждый вызов берёт глобальный лок и читает хранилище заново, а хранилище
// (src/lib/storage.ts) режет значение на куски по 1800 байт и читает их
// последовательно — сессия с JWT это 3-4 обращения к Keychain, помноженные
// на число живых потребителей экрана.
//
// Отсюда росли видимые рывки: профиль показывал скелет при каждом открытии
// вкладки, кнопки закладки и WhatsApp на карточке мастера появлялись после
// первого кадра, главная успевала смонтировать клиентский экран целиком и
// выбросить его, когда выяснялось, что пользователь — мастер.
//
// Логика вынесена из хука в модуль намеренно: среда тестов работает без
// рендера React, и в виде хука эти правила было нельзя проверить.

import type { Session } from "@supabase/supabase-js";
import { resolveAuthStateAfterDraft } from "@/features/auth/auth-session-policy";
import { activateOrderDraftOwnerForSession } from "@/lib/order-draft-store";
import { supabase } from "@/lib/supabase";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSessionState {
  session: Session | null;
  status: AuthStatus;
}

async function bindPrivateDraftToSession(session: Session | null): Promise<void> {
  await activateOrderDraftOwnerForSession(session?.user.id ?? null);
}

// Снимок держится по ссылке: useSyncExternalStore сравнивает результат
// getSnapshot через Object.is, поэтому объект пересоздаётся только при
// настоящем изменении. Иначе подписчики перерисовывались бы бесконечно.
let snapshot: AuthSessionState = { session: null, status: "loading" };

const listeners = new Set<() => void>();
let started = false;
let authEventSeen = false;

function publish(next: AuthSessionState): void {
  const sameStatus = next.status === snapshot.status;
  const sameToken = next.session?.access_token === snapshot.session?.access_token;
  if (sameStatus && sameToken) return;
  snapshot = next;
  for (const notify of listeners) notify();
}

/**
 * Запускается один раз, при первом подписчике. Отписки нет намеренно:
 * состояние сессии нужно всё время жизни приложения, а повторный запуск
 * вернул бы ровно ту цену чтения хранилища, ради устранения которой стор
 * и заведён.
 */
export function startAuthSessionStore(): void {
  if (started) return;
  started = true;

  void supabase.auth.getSession().then(async ({ data: { session } }) => {
    // Событие авторизации, пришедшее раньше ответа хранилища, свежее —
    // не затираем его устаревшим снимком.
    if (authEventSeen) return;
    const resolved = await resolveAuthStateAfterDraft(session, bindPrivateDraftToSession);
    if (authEventSeen) return;
    publish(resolved);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    authEventSeen = true;
    void resolveAuthStateAfterDraft(session, bindPrivateDraftToSession).then(publish);
  });
}

export function subscribeToAuthSession(onStoreChange: () => void): () => void {
  startAuthSessionStore();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getAuthSessionSnapshot(): AuthSessionState {
  return snapshot;
}

/** Только для тестов: вернуть модуль в исходное состояние между сценариями. */
export function __resetAuthSessionStoreForTests(): void {
  snapshot = { session: null, status: "loading" };
  listeners.clear();
  started = false;
  authEventSeen = false;
}

/** Только для тестов: сколько сейчас живых подписчиков. */
export function __authSessionListenerCountForTests(): number {
  return listeners.size;
}

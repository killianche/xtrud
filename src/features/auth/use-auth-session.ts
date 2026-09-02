// Состояние сессии Supabase — ОДИН общий источник на всё приложение.
//
// Было: хук держал собственный useState и заводил собственную пару
// getSession() + onAuthStateChange. При 43 вызовах это 43 независимые копии
// состояния, каждая из которых стартует с status: "loading" и сама читает
// сессию из защищённого хранилища.
//
// Цена этого была не теоретической. supabase-js не кэширует getSession в
// памяти: каждый вызов берёт глобальный лок и читает хранилище заново, а
// хранилище (src/lib/storage.ts) режет значение на куски по 1800 байт и
// читает их последовательно — сессия с JWT это 3-4 обращения к Keychain.
// Помножено на число живых потребителей экрана.
//
// Отсюда росли видимые рывки: профиль показывал скелет при каждом открытии
// вкладки, кнопки закладки и WhatsApp на карточке мастера появлялись после
// первого кадра, а главная успевала смонтировать клиентский экран целиком и
// выбросить его, когда выяснялось, что пользователь — мастер.
//
// Стало: модульный стор с одной подпиской. Первый потребитель запускает
// загрузку, остальные сразу получают уже известное состояние. Сигнатура хука
// не изменилась — ни один из 43 вызовов не тронут.

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
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
// настоящем изменении, иначе подписчики перерисовывались бы бесконечно.
let snapshot: AuthSessionState = { session: null, status: "loading" };

const listeners = new Set<() => void>();
let started = false;
let authEventSeen = false;

function publish(next: AuthSessionState): void {
  if (
    next.status === snapshot.status &&
    next.session?.access_token === snapshot.session?.access_token
  ) {
    return;
  }
  snapshot = next;
  for (const notify of listeners) notify();
}

/** Запускается один раз, при первом подписчике. Отписки нет намеренно:
 *  состояние сессии нужно всё время жизни приложения, а повторный запуск
 *  вернул бы ровно ту же цену чтения хранилища, ради устранения которой
 *  стор и заведён. */
function start(): void {
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

function subscribe(onStoreChange: () => void): () => void {
  start();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): AuthSessionState {
  return snapshot;
}

export function useAuthSession(): AuthSessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Только для тестов: сбросить стор между сценариями. */
export function __resetAuthSessionStoreForTests(): void {
  snapshot = { session: null, status: "loading" };
  listeners.clear();
  started = false;
  authEventSeen = false;
}

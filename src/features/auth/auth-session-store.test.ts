import { beforeEach, describe, expect, it, vi } from "vitest";

// Управляемые заглушки: тест сам решает, когда «ответит хранилище» и когда
// придёт событие авторизации. Именно порядок этих двух вещей и проверяется.
let getSessionResolve: ((value: { data: { session: unknown } }) => void) | null = null;
let authCallback: ((event: string, session: unknown) => void) | null = null;
let getSessionCalls = 0;
let subscribeCalls = 0;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => {
        getSessionCalls += 1;
        return new Promise((resolve) => {
          getSessionResolve = resolve as typeof getSessionResolve;
        });
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        subscribeCalls += 1;
        authCallback = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

vi.mock("@/lib/order-draft-store", () => ({
  activateOrderDraftOwnerForSession: vi.fn(async () => undefined),
}));

import {
  __authSessionListenerCountForTests,
  __resetAuthSessionStoreForTests,
  getAuthSessionSnapshot,
  subscribeToAuthSession,
} from "@/features/auth/auth-session-store";

const SESSION = { access_token: "token-a", user: { id: "u1" } };
const OTHER_SESSION = { access_token: "token-b", user: { id: "u2" } };

/** Даёт разрешиться цепочкам промисов внутри стора. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("общий стор сессии", () => {
  beforeEach(() => {
    __resetAuthSessionStoreForTests();
    getSessionResolve = null;
    authCallback = null;
    getSessionCalls = 0;
    subscribeCalls = 0;
  });

  it("читает хранилище один раз на любое число потребителей", () => {
    // Ровно та регрессия, ради которой стор и заведён: раньше каждый из 43
    // вызовов хука читал сессию сам.
    const unsubs = [
      subscribeToAuthSession(() => undefined),
      subscribeToAuthSession(() => undefined),
      subscribeToAuthSession(() => undefined),
    ];

    expect(getSessionCalls).toBe(1);
    expect(subscribeCalls).toBe(1);
    expect(__authSessionListenerCountForTests()).toBe(3);

    for (const off of unsubs) off();
    expect(__authSessionListenerCountForTests()).toBe(0);
  });

  it("оповещает всех подписчиков одним и тем же снимком", async () => {
    const seenA: unknown[] = [];
    const seenB: unknown[] = [];
    subscribeToAuthSession(() => seenA.push(getAuthSessionSnapshot()));
    subscribeToAuthSession(() => seenB.push(getAuthSessionSnapshot()));

    getSessionResolve?.({ data: { session: SESSION } });
    await settle();

    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(1);
    // Один объект на всех: если бы снимки различались, потребители разошлись бы
    // по состоянию, и экран снова мигал бы.
    expect(seenA[0]).toBe(seenB[0]);
    expect(getAuthSessionSnapshot().status).toBe("authenticated");
  });

  it("не откатывает состояние, если хранилище ответило ПОСЛЕ события входа", async () => {
    // Гонка реальная: событие onAuthStateChange приходит раньше, чем
    // разрешится медленное чтение Keychain. Устаревший ответ не должен
    // затирать свежий вход — иначе пользователя выбрасывало бы обратно.
    subscribeToAuthSession(() => undefined);

    authCallback?.("SIGNED_IN", OTHER_SESSION);
    await settle();
    expect(getAuthSessionSnapshot().session).toBe(OTHER_SESSION);

    getSessionResolve?.({ data: { session: null } });
    await settle();

    expect(getAuthSessionSnapshot().session).toBe(OTHER_SESSION);
    expect(getAuthSessionSnapshot().status).toBe("authenticated");
  });

  it("не трогает снимок, когда состояние не изменилось", async () => {
    // useSyncExternalStore сравнивает снимок по ссылке. Пересоздание объекта
    // без изменения содержимого — это бесконечная перерисовка всех 43 мест.
    let notifications = 0;
    subscribeToAuthSession(() => {
      notifications += 1;
    });

    getSessionResolve?.({ data: { session: SESSION } });
    await settle();
    const first = getAuthSessionSnapshot();
    expect(notifications).toBe(1);

    authCallback?.("TOKEN_REFRESHED", SESSION);
    await settle();

    expect(getAuthSessionSnapshot()).toBe(first);
    expect(notifications).toBe(1);
  });

  it("выход меняет снимок и оповещает", async () => {
    let notifications = 0;
    subscribeToAuthSession(() => {
      notifications += 1;
    });

    getSessionResolve?.({ data: { session: SESSION } });
    await settle();
    expect(notifications).toBe(1);

    authCallback?.("SIGNED_OUT", null);
    await settle();

    expect(getAuthSessionSnapshot().session).toBeNull();
    expect(getAuthSessionSnapshot().status).toBe("unauthenticated");
    expect(notifications).toBe(2);
  });
});

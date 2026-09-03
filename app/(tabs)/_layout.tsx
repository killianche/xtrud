import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "expo-router/react-navigation";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useTouchLastActive } from "@/features/auth/use-touch-last-active";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useRealtimeFeed, useUnreadFeedCount } from "@/features/orders/use-unread-feed";
import {
  useRealtimeMyResponses,
  useUnreadResponsesCount,
} from "@/features/orders/use-unread-responses";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useThemeColors } from "@/lib/use-theme-color";

function badgeLabel(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 99 ? "99+" : String(n);
}

export default function TabsLayout() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  // Роли больше нет (DECISION владельца 2026-09-01): счётчики считаются для
  // всех, потому что один и тот же человек и выкладывает задания, и
  // откликается на чужие. Раньше каждый счётчик был привязан к режиму, и
  // человек в «режиме мастера» не видел, что на его собственное задание
  // пришёл отклик.
  //
  // Цена названа честно: два запроса и две realtime-подписки на каждого
  // вошедшего вместо одной. Это плата за то, что человек больше не пропускает
  // половину того, что с ним происходит.

  // Отмечаем онлайн-активность (рейтинг мастеров, Этап 2). Троттл внутри хука.
  useTouchLastActive(!!userId);

  useRealtimeMyResponses(userId ?? null);

  // Непрочитанные отклики на мои задания.
  const { data: unreadResponses = 0 } = useUnreadResponsesCount(userId ?? null);

  // Непрочитанные задания в ленте по моим категориям, если они заданы.
  const { data: myCats } = useMyMasterCategories(userId);
  const masterL2Ids = myCats?.map((c) => c.l2_id) ?? [];
  const lastSeenFeedAt = user?.last_seen_feed_at ?? null;
  useRealtimeFeed({
    userId: userId ?? null,
    l2Ids: masterL2Ids,
  });
  const { data: unreadFeed = 0 } = useUnreadFeedCount({
    userId: userId ?? null,
    l2Ids: masterL2Ids,
    lastSeenAt: lastSeenFeedAt,
  });

  const ordersBadge = badgeLabel(unreadResponses);
  const findBadge = badgeLabel(unreadFeed);

  const tc = useThemeColors(["error", "canvas", "hairline", "ink", "accent", "mute"]);
  // Бейдж всегда на цветном фоне → текст фиксировано белый в обоих режимах.

  const { colorScheme } = useColorScheme();
  const baseNavTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    colors: {
      ...baseNavTheme.colors,
      background: tc.canvas,
      card: tc.canvas,
      border: tc.hairline,
      text: tc.ink,
      primary: tc.ink,
    },
  };

  // Нижнее меню — НАТИВНОЕ (DECISION владельца 2026-09-02, образец —
  // Thumbtack на iOS 26). На iOS 26 это Liquid Glass, на более старых —
  // системная панель. Самописная панель (TabBar.tsx) убрана: правило
  // docs/IOS_FOUNDATION.md — родной механизм вместо своего.
  //
  // Тап по активной вкладке сбрасывает её стек на корень средствами
  // NativeTabs (disablePopToTop=false по умолчанию) — прежние listeners не
  // нужны. Иконки — SF Symbols, цвет выбранной — фирменный акцент.
  return (
    <NavThemeProvider value={navTheme}>
      <NativeTabs
        tintColor={tc.accent}
        iconColor={{ default: tc.mute, selected: tc.accent }}
        badgeBackgroundColor={tc.error}
        labelStyle={{ default: { color: tc.mute }, selected: { color: tc.accent } }}
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} />
          <NativeTabs.Trigger.Label>Главная</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        {/* Видна всем: откликнуться может любой аккаунт. */}
        <NativeTabs.Trigger name="find">
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Найти задание</NativeTabs.Trigger.Label>
          {findBadge ? <NativeTabs.Trigger.Badge>{findBadge}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>

        {/* Каталог людей. Открыт всем, включая гостя: посмотреть, кто есть в
            республике, можно до регистрации — как и ленту заданий. */}
        <NativeTabs.Trigger name="specialists">
          <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
          <NativeTabs.Trigger.Label>Специалисты</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="orders">
          <NativeTabs.Trigger.Icon
            sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }}
          />
          <NativeTabs.Trigger.Label>Мои задания</NativeTabs.Trigger.Label>
          {ordersBadge ? <NativeTabs.Trigger.Badge>{ordersBadge}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>

        {/* Профиль — через аватар в правом верхнем углу главной. Скрытые
            вкладки остаются маршрутами: на них push'ят напрямую. «Сохранённые
            мастера» удалены целиком 2026-09-02. */}
        <NativeTabs.Trigger name="profile" hidden />
        <NativeTabs.Trigger name="cases" hidden />
      </NativeTabs>
    </NavThemeProvider>
  );
}

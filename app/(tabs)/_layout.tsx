import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "expo-router/react-navigation";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useMemo } from "react";
import { LIQUID_GLASS } from "@/components/ui/GlassSurface";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useTouchLastActive } from "@/features/auth/use-touch-last-active";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import {
  useUnreadOrderEventsCount,
  useUnreadReviewsCount,
} from "@/features/notifications/use-notifications";
import { useRealtimeNotifications } from "@/features/orders/use-realtime-notifications";
import { useUnreadFeedCount } from "@/features/orders/use-unread-feed";
import { useUnreadResponsesCount } from "@/features/orders/use-unread-responses";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { triggerTabScrollReset } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";

// Знак xtrud для вкладки «Главная»: assets/images/tab-home[@2x|@3x].png —
// монохромный, из splash-icon.png (25 pt, как системные иконки вкладок).
const HOME_TAB_ICON = require("../../assets/images/tab-home.png");

function badgeLabel(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 99 ? "99+" : String(n);
}

/** Слушатель вкладки: повторный тап по уже активной — прокрутить её к началу. */
function scrollToTopOnReselect(tabName: string) {
  return ({ navigation }: { navigation: { isFocused: () => boolean } }) => ({
    tabPress: () => {
      if (navigation.isFocused()) triggerTabScrollReset(tabName);
    },
  });
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

  // Непрочитанные отклики на мои задания.
  const { data: unreadResponses = 0 } = useUnreadResponsesCount(userId ?? null);

  // Непрочитанные задания в ленте по моим категориям, если они заданы.
  const { data: myCats } = useMyMasterCategories(userId);
  // Стабильный массив: новый экземпляр на каждый рендер переподписывал
  // realtime-канал ленты при каждом обновлении бейджа (QA 2026-09-06).
  const masterL2Key = (myCats ?? [])
    .map((c) => c.l2_id)
    .sort()
    .join(",");
  const masterL2Ids = useMemo(() => (masterL2Key ? masterL2Key.split(",") : []), [masterL2Key]);
  const lastSeenFeedAt = user?.last_seen_feed_at ?? null;
  // Одна личная подписка на уведомления вместо двух глобальных (0164).
  useRealtimeNotifications({ userId: userId ?? null, l2Ids: masterL2Ids });
  const { data: unreadFeed = 0 } = useUnreadFeedCount({
    userId: userId ?? null,
    l2Ids: masterL2Ids,
    lastSeenAt: lastSeenFeedAt,
  });

  // «Мои задания»: новые отклики клиенту + события по моим заказам (выбрали,
  // отменили, закрыли, отозвали отклик) — владелец 2026-09-07: «если отклик
  // пришёл либо статус моего заказа поменялся — циферка внизу».
  const { data: unreadOrderEvents = 0 } = useUnreadOrderEventsCount(userId ?? undefined);
  const ordersBadge = badgeLabel(unreadResponses + unreadOrderEvents);
  const findBadge = badgeLabel(unreadFeed);
  // «Специалисты»: новый отзыв мне — он виден в «Я специалист» и в профиле
  // (владелец, 2026-09-11: «получил отзыв и нигде не увидел»).
  const { data: unreadReviews = 0 } = useUnreadReviewsCount(userId ?? undefined);
  const specialistsBadge = badgeLabel(unreadReviews);

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
  // disableTransparentOnScrollEdge — исправление 2026-09-05 по скриншоту
  // владельца: «если iOS не последняя, происходит слияние в нижнем меню».
  // С iOS 15 UITabBar становится ПРОЗРАЧНОЙ, когда список докручен до края, —
  // и текст последней карточки читается прямо сквозь панель. На iOS 26 её
  // место занимает Liquid Glass, поэтому там этого не видно. Флаг оставляет
  // панели её материал и на старых версиях.
  //
  // Место под панель списки резервируют через useTabBarSpace
  // (src/lib/tab-bar-space.ts) — раньше каждый экран угадывал сам, и в ленте
  // не хватало ровно строки текста.
  //
  // Тап по активной вкладке сбрасывает её стек на корень средствами
  // NativeTabs (disablePopToTop=false по умолчанию). Прокрутка к началу —
  // через наш счётчик (src/lib/tab-scroll-reset.ts): нативный поиск
  // UIScrollView идёт по первому потомку, а у наших экранов первым стоит
  // закреплённая шапка, поэтому системный scroll-to-top списка не находит
  // (DECISION владельца 2026-09-07: «дважды нажал на вкладку — страница
  // откручивается наверх»). Иконки — SF Symbols, выбранная — акцент.
  return (
    <NavThemeProvider value={navTheme}>
      <NativeTabs
        disableTransparentOnScrollEdge={!LIQUID_GLASS}
        tintColor={tc.accent}
        iconColor={{ default: tc.mute, selected: tc.accent }}
        badgeBackgroundColor={tc.error}
        labelStyle={{ default: { color: tc.mute }, selected: { color: tc.accent } }}
      >
        <NativeTabs.Trigger name="index" listeners={scrollToTopOnReselect("index")}>
          {/* Знак xtrud вместо домика (владелец, 2026-09-07). Шаблонная
              картинка: система красит её цветом вкладки, как SF Symbol. */}
          <NativeTabs.Trigger.Icon src={HOME_TAB_ICON} renderingMode="template" />
          <NativeTabs.Trigger.Label>Главная</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        {/* Видна всем: откликнуться может любой аккаунт. */}
        {/* Подписи короткие: на iOS 26 выбранная вкладка разворачивается
            в «пилюлю» и отнимает ширину у соседей — «Мои задания» и
            «Найти задание» обрезались многоточием (владелец,
            2026-09-12). Короткое слово помещается при любой раскладке. */}
        <NativeTabs.Trigger name="orders" listeners={scrollToTopOnReselect("orders")}>
          <NativeTabs.Trigger.Icon
            sf={{ default: "checkmark.circle", selected: "checkmark.circle.fill" }}
          />
          <NativeTabs.Trigger.Label>Задания</NativeTabs.Trigger.Label>
          {ordersBadge ? <NativeTabs.Trigger.Badge>{ordersBadge}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="find" listeners={scrollToTopOnReselect("find")}>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
          <NativeTabs.Trigger.Label>Найти</NativeTabs.Trigger.Label>
          {findBadge ? <NativeTabs.Trigger.Badge>{findBadge}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>

        {/* Каталог людей. Открыт всем, включая гостя: посмотреть, кто есть в
            республике, можно до регистрации — как и ленту заданий. */}
        <NativeTabs.Trigger name="specialists" listeners={scrollToTopOnReselect("specialists")}>
          <NativeTabs.Trigger.Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
          <NativeTabs.Trigger.Label>Специалисты</NativeTabs.Trigger.Label>
          {specialistsBadge ? (
            <NativeTabs.Trigger.Badge>{specialistsBadge}</NativeTabs.Trigger.Badge>
          ) : null}
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

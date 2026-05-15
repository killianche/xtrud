// Контент главной для active_role='master'.
// Структура: availability + лимит откликов → ⭐ ЛЕНТА свежих заказов
// (P0-8) или empty state с CTA «Добавьте категории».
//
// N1 (2026-05-15): блок «Ваши категории» убран с главной — это
// настройка профиля, не daily-use. Категории редактируются через
// /profile → «Категории».

import { useRouter } from "expo-router";
import { ChevronRight, Inbox, Search } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { Skeleton } from "@/components/ui";
import { AvailabilitySwitcher } from "@/features/master-view/AvailabilitySwitcher";
import { ResponseLimitBadge } from "@/features/master-view/ResponseLimitBadge";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useMasterFeed } from "@/features/orders/use-master-feed";
import { useThemeColors } from "@/lib/use-theme-color";

interface MasterHomeContentProps {
  userId: string;
}

export function MasterHomeContent({ userId }: MasterHomeContentProps) {
  const router = useRouter();
  const { data: myCats } = useMyMasterCategories(userId);
  const tc = useThemeColors(["accent", "muted-soft", "on-primary"]);

  const hasCategories = (myCats?.length ?? 0) > 0;

  // P0-8: главная мастера = свежие заказы. До этого было «Заявок пока нет»
  // как только empty state — мастер не понимал куда смотреть и зачем
  // открывать tab «Заказы». Эталон Яндекс.Pro / Profi.ru — лента сразу.
  const l2Ids = (myCats ?? []).map((mc) => mc.l2_id);
  const { data: feed, isLoading: feedLoading } = useMasterFeed({ userId, l2Ids });
  const recentOrders = (feed?.pages?.[0]?.rows ?? []).slice(0, 3);
  const hasOrders = recentOrders.length > 0;

  return (
    <View className="gap-6 px-6">
      {/* Availability switcher — наверху, как «онлайн» в такси */}
      <AvailabilitySwitcher userId={userId} />

      {/* P0-5: бейдж дневного лимита откликов (5 в день в free-tier).
          Self-start чтобы не растягивался на всю ширину. */}
      <ResponseLimitBadge />

      {/* N1: блок «Ваши категории» убран — это настройки профиля,
          редактируются через /profile, не нужны на daily-use главной. */}

      {/* CTA «Поиск заказов» — большая заметная кнопка на main entry-point
          для мастера. Ведёт на /orders где search-input + chip-фильтр L2 (N3). */}
      {hasCategories ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Поиск заказов"
          onPress={() => router.push("/(tabs)/orders")}
          className="flex-row items-center gap-3 rounded-xl bg-ink p-4 active:opacity-80"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-on-primary/10">
            <Search size={20} strokeWidth={2} color={tc["on-primary"]} />
          </View>
          <View className="flex-1">
            <AppText weight="semibold" className="text-body-md text-on-primary">
              Поиск заказов
            </AppText>
            <AppText className="mt-0.5 text-caption text-on-primary/70">
              Найти заявки по категории, тексту, новизне
            </AppText>
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(onboarding)/master-categories")}
          className="flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
        >
          <View className="flex-1">
            <AppText weight="semibold" className="text-body-md text-ink">
              Добавьте категории
            </AppText>
            <AppText className="mt-1 text-body-sm text-muted">
              Без категорий клиенты не увидят вас в каталоге.
            </AppText>
          </View>
        </Pressable>
      )}

      {/* P0-8: Свежие заказы прямо на главной мастера. */}
      <View>
        <View className="flex-row items-center justify-between">
          <AppText weight="semibold" className="text-title-lg text-ink">
            Новые заказы
          </AppText>
          {hasOrders ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/orders")}
              className="flex-row items-center gap-1 active:opacity-70"
              hitSlop={8}
            >
              <AppText weight="medium" className="text-caption text-accent">
                Все заявки
              </AppText>
              <ChevronRight size={14} strokeWidth={2} color={tc.accent} />
            </Pressable>
          ) : null}
        </View>

        {feedLoading && hasCategories && (
          <View className="mt-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="rounded-lg" height={84} />
            ))}
          </View>
        )}

        {!feedLoading && hasOrders && (
          <View className="mt-3 gap-3">
            {recentOrders.map((o) => (
              <OrderRow
                key={o.id}
                id={o.id}
                title={o.title}
                categoryName={o.l2?.name_ru ?? o.l2_id}
                categoryIcon={o.l2?.icon ?? null}
                categoryL2Id={o.l2_id}
                cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}
                district={o.district}
                urgency={o.urgency}
                responsesCount={o.responses_count}
                createdAt={o.created_at}
                status="open"
                onPress={() => router.push(`/(tabs)/orders/${o.id}`)}
              />
            ))}
          </View>
        )}

        {!feedLoading && !hasOrders && (
          <View className="mt-3 items-center rounded-lg bg-surface-2 px-6 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-3">
              <Inbox size={24} strokeWidth={1.75} color={tc["muted-soft"]} />
            </View>
            <AppText weight="semibold" className="mt-4 text-title-md text-ink">
              Заявок пока нет
            </AppText>
            <AppText className="mt-2 text-center text-body-sm text-muted">
              {hasCategories
                ? "Здесь появятся новые заявки клиентов по вашим категориям."
                : "Добавьте категории, чтобы получать заявки."}
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

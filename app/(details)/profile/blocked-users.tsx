/**
 * /profile/blocked-users — список заблокированных пользователей.
 *
 * UGC safety (App Store Guideline 1.2): владелец списка может в любой момент
 * посмотреть, кого заблокировал, и снять блокировку. Точка входа — settings.tsx
 * → «Приватность и блокировки» → «Заблокированные пользователи».
 *
 * Приватный экран (НЕ в PUBLIC_DETAIL_ROUTES) — анон сюда попасть не может,
 * AuthGate в app/_layout.tsx отправит его на (tabs) раньше рендера.
 *
 * До применения миграции 0124 (supabase/migration-drafts) таблица
 * `user_blocks` не существует в БД — запрос падает ошибкой, экран показывает
 * error-state. Это ожидаемое поведение до промоушена миграции, не баг клиента.
 */

import { FlashList } from "@shopify/flash-list";
import { Prohibit } from "phosphor-react-native";
import { Alert, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, ScreenHeader, Skeleton } from "@/components/ui";
import { blockingActionFailureMessage } from "@/features/blocking/blocking-error-message";
import {
  type BlockedUserRow,
  useBlockedUsers,
  useUnblockUser,
} from "@/features/blocking/use-user-blocks";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Заблокированные" onBack={goBack} />

      {blocked.isLoading ? (
        <View className="px-5 pt-3 gap-3">
          <Skeleton style={{ height: 92, borderRadius: 12 }} />
          <Skeleton style={{ height: 92, borderRadius: 12 }} />
          <Skeleton style={{ height: 92, borderRadius: 12 }} />
        </View>
      ) : blocked.error ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText weight="medium" className="text-body-md text-error text-center">
            Не удалось загрузить список. {blockingActionFailureMessage(blocked.error)}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку списка заблокированных"
            disabled={blocked.isRefetching}
            onPress={() => void blocked.refetch()}
            className="mt-4 min-h-11 items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-sm text-ink">
              {blocked.isRefetching ? "Загружаем…" : "Повторить"}
            </AppText>
          </Pressable>
        </View>
      ) : (blocked.data ?? []).length === 0 ? (
        <EmptyState />
      ) : (
        <FlashList
          data={blocked.data ?? []}
          keyExtractor={(item) => item.blockedId}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 32,
          }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          renderItem={({ item }) => (
            <BlockedUserCard
              item={item}
              pending={unblock.isPending && unblock.variables === item.blockedId}
              onUnblock={async () => {
                const fullName =
                  [item.firstName, item.lastName].filter(Boolean).join(" ") || "Пользователь";
                const confirmed = await confirmAsync({
                  title: "Разблокировать пользователя?",
                  message: `Вы снова увидите заказы, отклики и профиль «${fullName}». Ему снова станут доступны ваши заказы и отклики — это снимет сервер.`,
                  confirmText: "Разблокировать",
                  cancelText: "Отмена",
                });
                if (!confirmed) return;
                unblock.mutate(item.blockedId, {
                  onError: (e) =>
                    Alert.alert("Не удалось разблокировать", blockingActionFailureMessage(e)),
                });
              }}
            />
          )}
        />
      )}
    </View>
  );
}

// ----------------------------------------------------------------------------
// BlockedUserCard — аватар + имя (2 строки) сверху, роль + дата блокировки
// caption-строкой, кнопка «Разблокировать» отдельной строкой ниже. Outline,
// НЕ destructive — разблокировка не деструктивное действие.
// ----------------------------------------------------------------------------

interface BlockedUserCardProps {
  item: BlockedUserRow;
  pending: boolean;
  onUnblock: () => void;
}

function BlockedUserCard({ item, pending, onUnblock }: BlockedUserCardProps) {
  const fullName = [item.firstName, item.lastName].filter(Boolean).join(" ") || "Пользователь";
  const roleLabel = item.isMaster ? "Мастер" : "Клиент";

  return (
    <View className="rounded-lg border border-hairline bg-canvas-soft p-3">
      <View className="flex-row items-center gap-3">
        <Avatar url={item.avatarUrl} name={fullName} seed={item.blockedId} size="md" />
        <View className="flex-1 min-w-0">
          <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={2}>
            {fullName}
          </AppText>
          <AppText className="mt-0.5 text-caption text-mute">
            {roleLabel} · Заблокирован {formatBlockedDate(item.createdAt)}
          </AppText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Разблокировать ${fullName}`}
        accessibilityHint="Вернёт вам его заказы, отклики и профиль"
        onPress={onUnblock}
        disabled={pending}
        className="mt-3 min-h-11 self-start flex-row items-center justify-center rounded-pill border border-hairline px-4 active:bg-canvas-soft"
      >
        <AppText weight="semibold" className="text-button-sm text-ink">
          {pending ? "Разблокируем…" : "Разблокировать"}
        </AppText>
      </Pressable>
    </View>
  );
}

// ----------------------------------------------------------------------------
// EmptyState — без CTA-кнопки (спека): круг 64×64 + иконка, заголовок,
// объяснение где запускается действие блокировки.
// ----------------------------------------------------------------------------

function EmptyState() {
  const tc = useThemeColors(["muted-soft"]);
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-canvas-soft">
        <Prohibit size={28} weight="bold" color={tc["muted-soft"]} />
      </View>
      <AppText weight="semibold" className="mt-4 text-title-lg text-ink text-center">
        Никого не заблокировано
      </AppText>
      <AppText className="mt-2 text-body-md text-body text-center">
        Заблокировать можно из меню «Действия» в профиле мастера, клиента или на странице задания.
      </AppText>
    </View>
  );
}

function formatBlockedDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

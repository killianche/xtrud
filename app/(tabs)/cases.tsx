/**
 * /cases — вкладка мастера в нижнем меню (2026-05-20).
 *
 * Только «Кейсы» — фото работ. Переиспользует CaseCard + CreateCaseSheet из
 * profile/portfolio/index.tsx (экспортированы).
 *
 * История: 2026-05-20 убрали внутренний таб «Отзывы» (вместе с переходом
 * на classified-ads модель — рейтинги/отзывы выключены до возврата к chat-flow).
 *
 * Скрыт у клиента через href: null в (tabs)/_layout.tsx (active_role !== "master").
 * Старые роуты /profile/portfolio оставлены как есть — кейс-detail работает.
 */

import { useRouter } from "expo-router";
import { ImageSquare } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { CaseCard, CreateCaseSheet } from "./profile/portfolio/index";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useCreateCase,
  useMasterCases,
} from "@/features/profile/use-portfolio-cases";
import { useThemeColors } from "@/lib/use-theme-color";

export default function CasesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const tc = useThemeColors(["muted-soft"]);

  const [createOpen, setCreateOpen] = useState(false);

  const { data: cases = [] } = useMasterCases(userId);
  const createCase = useCreateCase(userId);

  if (!userId) {
    return (
      <View
        className="flex-1 bg-canvas items-center justify-center px-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <AppText className="text-body-md text-mute">Войдите в аккаунт.</AppText>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Ваши работы" />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 96,
        }}
        showsVerticalScrollIndicator={false}
      >
        {cases.length === 0 ? (
          <View className="items-center justify-center py-16 px-6">
            <ImageSquare size={48} weight="regular" color={tc["muted-soft"]} />
            <AppText
              weight="semibold"
              className="mt-4 text-title-md text-ink text-center"
            >
              Покажите ваши работы
            </AppText>
          </View>
        ) : (
          <View className="gap-6">
            {cases.map((c) => (
              <CaseCard
                key={c.id}
                caseItem={c}
                onPress={() =>
                  router.push(`/(tabs)/profile/portfolio/${c.id}` as never)
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom CTA — «Новая работа». */}
      <View
        className="absolute left-0 right-0 bg-canvas border-t border-hairline px-5 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Новая работа"
          onPress={() => setCreateOpen(true)}
          className="flex-row items-center justify-center gap-2 h-12 rounded-md bg-primary active:opacity-80"
        >
          <AppText weight="semibold" className="text-button-lg text-on-primary">
            + Новая работа
          </AppText>
        </Pressable>
      </View>

      <CreateCaseSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        isPending={createCase.isPending}
        onSubmit={async (input: {
          title: string;
          description: string | null;
        }) => {
          if (!userId) return;
          try {
            const created = await createCase.mutateAsync({
              ...input,
              workDoneAt: null,
            });
            setCreateOpen(false);
            // Сразу открываем созданный кейс — мастер добавит фото на следующем шаге.
            router.push(`/(tabs)/profile/portfolio/${created.id}` as never);
          } catch (e) {
            Alert.alert(
              "Не удалось создать работу",
              e instanceof Error ? e.message : "Неизвестная ошибка",
            );
          }
        }}
      />
    </View>
  );
}

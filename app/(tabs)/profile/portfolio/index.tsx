/**
 * /profile/portfolio — список кейсов мастера + создание нового.
 *
 * Редизайн 2026-05-18 по фидбэку user:
 *   «Перед добавлением фото можно создать кейс выполненных работ. При нажатии
 *    плюс задаём название, фото, описание, дату. В дальнейшем открываем кейс
 *    и добавляем фото или новый кейс. Если выполнил работу для клиента —
 *    это сразу становится кейсом. Фото лишь прикреплены к кейсам.»
 *
 * Что показываем:
 *   - Карточка-кейс: title, work_done_at, preview 3 фото, count badge «+N».
 *   - Кейсы созданные авто при completion заказа (миграция 0085 trigger)
 *     тоже видны — мастер потом добавит фото.
 *   - Sticky bottom CTA «+ Новый кейс» → bottom-sheet modal с формой
 *     (название, описание, дата выполнения).
 *
 * Тап по кейсу → /profile/portfolio/[caseId] (детальный экран с grid'ом фото).
 */

import { useRouter } from "expo-router";
import { CaretLeft, Image as ImageIcon, Plus } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  type CaseWithPreview,
  useCreateCase,
  useMasterCases,
} from "@/features/profile/use-portfolio-cases";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function PortfolioCasesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const tc = useThemeColors(["ink", "mute", "muted-soft", "canvas-soft", "on-primary"]);

  const { data: cases = [], isLoading } = useMasterCases(userId);
  const createCase = useCreateCase(userId);

  const [createOpen, setCreateOpen] = useState(false);

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
    <View className="flex-1 bg-canvas">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-3 py-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={22} weight="bold" color={tc.ink} />
        </Pressable>
        <AppText weight="semibold" className="text-body-md text-ink">
          Портфолио
        </AppText>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View className="gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton position
                key={i}
                className="rounded-xl bg-canvas-soft-2"
                style={{ height: 200 }}
              />
            ))}
          </View>
        ) : cases.length === 0 ? (
          <View
            className="items-center justify-center rounded-xl bg-canvas-soft px-6 py-12"
            style={{ minHeight: 260 }}
          >
            <ImageIcon size={36} weight="bold" color={tc["muted-soft"]} />
            <AppText weight="semibold" className="mt-3 text-body-md text-ink text-center">
              Пока нет кейсов
            </AppText>
            <AppText className="mt-2 text-body-sm text-mute text-center">
              Создайте первый кейс выполненной работы — клиенты доверяют мастерам с портфолио в 4
              раза чаще.
            </AppText>
            {/* P1 fix 2026-05-20: убрали inline-кнопку «Создать кейс» — она
                дублировала sticky bottom CTA «Новый кейс» (визуальная избыточность).
                Sticky кнопка видна всегда, в т.ч. на empty state. */}
          </View>
        ) : (
          <View className="gap-3">
            {cases.map((c) => (
              <CaseCard
                key={c.id}
                caseItem={c}
                onPress={() => router.push(`/(tabs)/profile/portfolio/${c.id}` as never)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom CTA — показываем всегда, даже когда empty (там тоже
          inline-кнопка). Тап → modal с формой создания. */}
      <View
        className="absolute left-0 right-0 bg-canvas border-t border-hairline px-5 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Новый кейс"
          onPress={() => setCreateOpen(true)}
          className="flex-row items-center justify-center gap-2 h-12 rounded-lg bg-ink active:opacity-80"
        >
          <Plus size={18} weight="bold" color={tc["on-primary"]} />
          <AppText weight="semibold" className="text-body-md text-on-primary">
            Новый кейс
          </AppText>
        </Pressable>
      </View>

      <CreateCaseSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async ({ title, description }) => {
          try {
            const created = await createCase.mutateAsync({
              title,
              description,
              workDoneAt: null,
            });
            setCreateOpen(false);
            // Сразу открываем созданный кейс — мастер хочет добавить фото.
            router.push(`/(tabs)/profile/portfolio/${created.id}` as never);
          } catch (e) {
            Alert.alert("Не удалось создать кейс", e instanceof Error ? e.message : String(e));
          }
        }}
        isPending={createCase.isPending}
      />
    </View>
  );
}

// ============================================================================
// CaseCard — карточка кейса в списке (preview-фото + название + дата).
// ============================================================================

export function CaseCard({
  caseItem,
  onPress,
}: {
  caseItem: CaseWithPreview;
  onPress: () => void;
}) {
  const screenW = useAppWidth();
  // Редизайн 2026-05-20: убрали обводку и внутренние padding'и (была «матрёшка»
  // карточек). Hero-фото = главный визуал, занимает 16:9. Title + meta ПОД фото
  // без рамки. Этот pattern — Universe / Fever / VSCO (Lazyweb refs).
  const heroHeight = Math.floor((screenW - 32) * 0.5625); // 16:9 ratio
  const tc = useThemeColors(["muted-soft", "mute"]);

  const formattedDate = caseItem.work_done_at
    ? new Date(caseItem.work_done_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const photoCount = caseItem.items_count;
  const hasHero = caseItem.preview_items.length > 0;
  const heroItem = hasHero ? caseItem.preview_items[0] : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caseItem.title}
      onPress={onPress}
      className="active:opacity-80"
    >
      {/* Hero — 16:9, либо фото, либо dashed placeholder с CTA. */}
      {hasHero && heroItem ? (
        <View
          className="overflow-hidden rounded-xl bg-canvas-soft-2"
          style={{ height: heroHeight, position: "relative" }}
        >
          <Image
            source={{ uri: heroItem.url }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
          {/* Счётчик доп. фото в углу — если фото больше 1. */}
          {photoCount > 1 ? (
            <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-black/60 px-2.5 py-1">
              <ImageIcon size={12} weight="fill" color="white" />
              <AppText weight="semibold" className="text-mono-caption text-white">
                {photoCount}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          className="items-center justify-center rounded-xl border-2 border-dashed border-hairline bg-canvas"
          style={{ height: heroHeight }}
        >
          <ImageIcon size={28} weight="bold" color={tc["muted-soft"]} />
          <AppText weight="medium" className="mt-2 text-body-sm text-mute">
            Добавьте фото
          </AppText>
        </View>
      )}

      {/* Title + meta ПОД фото — без рамки, чистый текст. */}
      <View className="mt-3 px-1">
        <AppText weight="semibold" className="text-title-md text-ink" numberOfLines={2}>
          {caseItem.title}
        </AppText>
        {formattedDate ? (
          <AppText weight="mono" className="mt-1 text-mono-caption text-mute">
            {formattedDate}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

// ============================================================================
// CreateCaseSheet — full-screen форма создания кейса (внутри BottomSheet).
//
// Редизайн 2026-05-23 (фидбэк user «убери „когда выполнено“, сделай в
// современном крутом стиле»). Lazyweb-референсы: Audible «New collection»
// (плоские bold-лейблы + char-counter под полем, без иконок), Linear «New
// issue» (типографика как герой, без декора), ChatGPT «New project»
// (single primary pill + functional explainer), Depop «Sell an item»
// (tall rounded inputs + sticky footer CTA).
//
// Решения:
//   - Удалена секция «Когда выполнено» целиком (дата всегда уходит null,
//     колонка work_done_at в БД остаётся для авто-кейсов).
//   - Убраны иконки-лейблы полей и uppercase-эйбрау «О РАБОТЕ» — для двух
//     полей это шум. Чистые bold-лейблы (Audible / Linear style).
//   - Char-counter перенесён под каждое поле справа (Audible) — не теснит
//     лейбл, считывается как «сколько осталось».
//   - Горизонтальный padding px-5 (BottomSheet контент без default-padding).
//   - Поля выше (h-13 / minHeight 128) + rounded-lg + крупный internal
//     padding — premium-ощущение вместо «дёшево».
//   - Один primary pill CTA + functional helper о следующем шаге (не
//     декоративный подзаголовок — рассказывает что произойдёт дальше).
// ============================================================================

const MAX_TITLE_LEN = 120;
const MAX_DESCRIPTION_LEN = 500;

interface CreateCaseSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; description: string | null }) => void;
  isPending: boolean;
}

export function CreateCaseSheet({ open, onClose, onSubmit, isPending }: CreateCaseSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const tc = useThemeColors(["mute", "muted-soft", "ink"]);

  // Сброс полей при закрытии чтобы следующее открытие было чистым.
  const handleClose = () => {
    if (isPending) return;
    setTitle("");
    setDescription("");
    onClose();
  };

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length >= 2 && !isPending;
  const titleLen = title.length;
  const descriptionLen = description.length;

  return (
    <BottomSheet open={open} onClose={handleClose} title="Новый кейс">
      <View className="flex-1 px-5">
        <View className="gap-8 pt-2">
          {/* ============ Название ============ */}
          <View>
            <AppText weight="semibold" className="text-body-md text-ink">
              Название
            </AppText>
            <TextInput
              value={title}
              onChangeText={(v) => setTitle(v.slice(0, MAX_TITLE_LEN))}
              placeholder="Например, ремонт ванной с плиткой"
              placeholderTextColor={tc.mute}
              autoCapitalize="sentences"
              autoFocus
              maxLength={MAX_TITLE_LEN}
              editable={!isPending}
              className="mt-2.5 h-14 rounded-lg border border-hairline bg-canvas-soft px-4 text-body-md text-ink"
            />
            <AppText
              weight="mono"
              className={`mt-1.5 self-end text-mono-caption ${
                titleLen > MAX_TITLE_LEN - 20 ? "text-warning" : "text-muted-soft"
              }`}
            >
              {titleLen} / {MAX_TITLE_LEN}
            </AppText>
          </View>

          {/* ============ Описание (не обязательно) ============ */}
          <View>
            <View className="flex-row items-baseline gap-1.5">
              <AppText weight="semibold" className="text-body-md text-ink">
                Описание
              </AppText>
              <AppText className="text-body-sm text-mute">не обязательно</AppText>
            </View>
            <TextInput
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, MAX_DESCRIPTION_LEN))}
              placeholder="Какие работы делали, какие материалы, что было сложного"
              placeholderTextColor={tc.mute}
              autoCapitalize="sentences"
              multiline
              maxLength={MAX_DESCRIPTION_LEN}
              editable={!isPending}
              className="mt-2.5 rounded-lg border border-hairline bg-canvas-soft px-4 py-3.5 text-body-md text-ink"
              style={{ minHeight: 128, textAlignVertical: "top" }}
            />
            <AppText
              weight="mono"
              className={`mt-1.5 self-end text-mono-caption ${
                descriptionLen > MAX_DESCRIPTION_LEN - 50 ? "text-warning" : "text-muted-soft"
              }`}
            >
              {descriptionLen} / {MAX_DESCRIPTION_LEN}
            </AppText>
          </View>
        </View>

        {/* ============ Footer: один primary CTA + explainer о шаге ============ */}
        <View className="mt-auto gap-3 pt-6">
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={() =>
              onSubmit({
                title: trimmedTitle,
                description: description.trim() || null,
              })
            }
            className={`h-14 items-center justify-center rounded-full ${
              canSubmit ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText
              weight="semibold"
              className={`text-button-lg ${canSubmit ? "text-on-primary" : "text-mute"}`}
            >
              {isPending ? "Создаём…" : "Создать кейс"}
            </AppText>
          </Pressable>
          <AppText className="text-caption text-mute text-center">
            На следующем шаге добавите фото работы.
          </AppText>
        </View>
      </View>
    </BottomSheet>
  );
}

/**
 * MasterPublishChecklist — мягкая подсказка «сделайте профиль ярче».
 *
 * История (2026-05-20): сначала это был «жёсткий» чек-лист — пока мастер не
 * заполнил 3 пункта, его профиль был скрыт от каталога. С 2026-05-20 модель
 * сменилась: профиль виден сразу, чек-лист стал **рекламной подсказкой** —
 * мотивирует мастера дозаполнить профиль ради большего количества откликов.
 *
 * Поля для прокачки (старые из миграции 0084):
 *   1. >= 5 фото портфолио
 *   2. >= 1 категория
 *   3. experience_years > 0
 *
 * Когда все 3 выполнены — карточка исчезает (родитель проверяет !isReady).
 * Каждая строка — Pressable, ведёт на нужный экран заполнения.
 */

import { useRouter } from "expo-router";
import { Briefcase, CaretRight, CheckCircle, CircleDashed, ImageSquare } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { MasterPublishProgress } from "@/features/master-view/use-master-publish-progress";

interface RowProps {
  done: boolean;
  title: string;
  hint: string;
  onPress: () => void;
  Icon: typeof ImageSquare;
}

function ChecklistRow({ done, title, hint, onPress, Icon }: RowProps) {
  const tc = useThemeColors(["ink", "success", "muted-soft"]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-md px-2 py-3 active:bg-canvas-soft"
    >
      <View style={{ width: 24, height: 24 }}>
        {done ? (
          <CheckCircle size={24} weight="fill" color={tc.success} />
        ) : (
          <CircleDashed size={24} weight="regular" color={tc["muted-soft"]} />
        )}
      </View>
      <View className="flex-1">
        <AppText
          weight="semibold"
          className={`text-body-md ${done ? "text-mute" : "text-ink"}`}
        >
          {title}
        </AppText>
        <AppText className="mt-0.5 text-caption text-mute">{hint}</AppText>
      </View>
      <Icon size={18} weight="bold" color={tc["muted-soft"]} />
      <CaretRight size={16} weight="bold" color={tc["muted-soft"]} />
    </Pressable>
  );
}

interface MasterPublishChecklistProps {
  progress: MasterPublishProgress;
}

export function MasterPublishChecklist({ progress }: MasterPublishChecklistProps) {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const progressPct = (progress.doneCount / progress.totalCount) * 100;

  return (
    <View className="mx-5 mt-6 rounded-xl border border-hairline bg-canvas-soft p-5">
      <AppText weight="semibold" className="text-title-md text-ink">
        Поднимитесь выше в поиске
      </AppText>
      <AppText className="mt-1 text-body-sm text-mute">
        Заполненный профиль показывается выше в поиске и приносит больше откликов.
      </AppText>

      {/* Progress bar */}
      <View className="mt-4 h-2 rounded-full bg-canvas-soft-2 overflow-hidden">
        <View
          className="h-full bg-ink"
          style={{ width: `${progressPct}%`, backgroundColor: tc.ink }}
        />
      </View>
      <AppText weight="mono" className="mt-2 text-mono-caption text-mute">
        {progress.doneCount} из {progress.totalCount} выполнено
      </AppText>

      <View className="mt-3 gap-1">
        <ChecklistRow
          done={progress.portfolioCount >= progress.portfolioRequired}
          title="Добавьте 5 фото работ"
          hint={`Загружено ${progress.portfolioCount} из ${progress.portfolioRequired}`}
          Icon={ImageSquare}
          onPress={() => router.push("/(tabs)/profile/portfolio" as never)}
        />
        <ChecklistRow
          done={progress.categoryCount >= progress.categoryRequired}
          title="Выберите хотя бы одну категорию"
          hint={
            progress.categoryCount > 0
              ? `Выбрано: ${progress.categoryCount}`
              : "Категория услуг, которую вы оказываете"
          }
          Icon={Briefcase}
          onPress={() => router.push("/(onboarding)/master-categories" as never)}
        />
        <ChecklistRow
          done={!!progress.experienceYears && progress.experienceYears > 0}
          title="Укажите опыт работы"
          hint={
            progress.experienceYears && progress.experienceYears > 0
              ? `${progress.experienceYears} ${
                  progress.experienceYears === 1 ? "год" : "лет"
                }`
              : "Сколько лет вы в профессии"
          }
          Icon={Briefcase}
          onPress={() => router.push("/(tabs)/profile/edit-master" as never)}
        />
      </View>

      {/* Подсказка о «живых» факторах рейтинга (доступность + отклики), которые
          поднимают мастера сразу, помимо заполненности профиля
          (MASTER_RANKING_PLAN.md §3.5 — прозрачность для мастера). */}
      <View className="mt-3 border-t border-hairline pt-3">
        <AppText className="text-caption text-mute" style={{ lineHeight: 18 }}>
          Нажимайте «Готов сегодня» и отвечайте на заказы — активные мастера
          показываются выше.
        </AppText>
      </View>
    </View>
  );
}

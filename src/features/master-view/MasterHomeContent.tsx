/**
 * Контент главной для active_role='master'.
 *
 * По фидбэку владельца 2026-05-28: главная мастера — это **дискавери-витрина**
 * для поиска новых заказов. Мастер в xtrud не ведёт переписку и не принимает
 * заказы в-приложении — он только откликается, дальше клиент звонит / пишет в
 * WhatsApp. После отклика мастеру делать в продукте нечего, поэтому JTBD главной
 * = «найти новый заказ», а не «следить за уже отправленными откликами».
 *
 * История блоков на главной:
 *   - 2026-05-15 (perf-agent) — много блоков (metrics + quota + quick actions +
 *     tip-card). Перегружено, отменено.
 *   - 2026-05-15 (поздно) — только «Готовы работать?» (AvailabilitySwitcher).
 *   - 2026-05-24 — добавлены «Ваши отклики» (MasterDashboardOrders) + callout
 *     «Добавьте категории». Аватар/приветствие/статистика — в фото-героe выше.
 *   - 2026-05-27 — над «Ваши отклики» добавлена секция «Подобрали для вас»
 *     (MasterRecommendationsSection): open-заказы по категориям мастера, на
 *     которые он ещё не откликался. Цель: убрать лишний шаг «зайти в
 *     /orders/search → отфильтровать по своим категориям».
 *   - 2026-05-28 (утро) — «Ваши отклики» УБРАНЫ с главной. Уехали на отдельный
 *     экран /orders/my-responses. Главная стала = три подборки заказов
 *     («Подобрали для вас» + «Срочно сегодня» + «Недавно добавленные»).
 *   - **2026-05-28 (текущая итерация, вечер)** — «Срочно сегодня» и «Недавно
 *     добавленные» УБРАНЫ как отдельные секции. Их данные слиты в одну
 *     «Подобрали для вас» (она и так использует filter:'all', т.е. все open-
 *     заказы по моим категориям — это надмножество срочных и свежих). Лимит
 *     поднят с 5 до 10 карточек. Фидбэк владельца: «оставим только Подобрали
 *     для вас, туда внедрим и срочные, и недавно добавленные».
 *     Компоненты MasterUrgentTodaySection / MasterFreshTodaySection оставлены
 *     в репо (не удалены), но не импортируются — могут пригодиться позже.
 *
 * Единственный conditional CTA: callout «Добавьте категории» если у мастера их
 * нет — без них он не виден в каталоге и подборки тоже пустые.
 */

import { useRouter } from "expo-router";
import { Plus } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { MasterRecommendationsSection } from "@/features/master-view/MasterRecommendationsSection";
import { MyResponsesEntry } from "@/features/master-view/MyResponsesEntry";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useThemeColor } from "@/lib/use-theme-color";

interface MasterHomeContentProps {
  userId: string;
}

export function MasterHomeContent({ userId }: MasterHomeContentProps) {
  const router = useRouter();
  const { data: myCats } = useMyMasterCategories(userId);
  const onPrimary = useThemeColor("on-primary");

  const hasCategories = (myCats?.length ?? 0) > 0;

  return (
    // Главная мастера: pill-вход «Мои отклики (N)» + единая подборка
    // «Подобрали для вас» (до 10 карточек) + callout если категории не выбраны.
    // Кнопка откликов раньше жила в шапке /orders/search, перенесена сюда по
    // фидбэку владельца 2026-05-28 (вечер): мастер на главной первым делом
    // видит свой статус-оверview и сразу подборку новых заказов.
    <View className="gap-6 pt-4">
      <MyResponsesEntry userId={userId} />
      <MasterRecommendationsSection userId={userId} />

      {/* Categories callout — единственный conditional блок. */}
      {!hasCategories ? (
        <View className="px-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(onboarding)/master-categories")}
            className="flex-row items-center justify-between rounded-2xl border border-hairline bg-canvas-soft p-5 active:opacity-70"
          >
            <View className="flex-1">
              <AppText weight="semibold" className="text-body-md text-ink">
                Добавьте категории
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute">
                Без категорий клиенты не увидят вас в каталоге.
              </AppText>
            </View>
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <Plus size={20} weight="bold" color={onPrimary} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * /orders/new/section?id= — подкатегории раздела, второй этап шага «Какая
 * категория?».
 *
 * Владелец, 2026-10-04: «когда открыты подкатегории и я свайпаю назад, меня
 * выкидывает из задания — должно вернуть к категориям». Раньше раздел
 * раскрывался на том же экране, и системный жест «назад» снимал весь шаг.
 * Теперь раздел — отдельный экран стека, как в «Настройках» iOS: жест и
 * кнопка «назад» возвращают к списку разделов.
 *
 * Тап по подкатегории выбирает её и сразу ведёт дальше. Открыт «из
 * проверки» — возврат на проверку минуя список разделов (dismiss(2)).
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { CategoryPickerTwoStep } from "@/features/task-composer/CategoryPickerTwoStep";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { COMPOSER_ROUTE, isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskCategorySectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const sectionId = typeof params.id === "string" ? params.id : "";
  const composer = useComposer();
  const { values, patch } = composer;
  const nav = useStepNavigation("category");
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const section = (l1.data ?? []).find((s) => s.id === sectionId);

  // Выбор подкатегории — сразу следующий шаг; дополнительные категории (0195)
  // очищаются, как и на списке разделов.
  const onPick = (id: string) => {
    patch({ l2Id: id, extraL2Ids: [] });
    if (nav.fromReview) {
      // Над проверкой лежат два экрана: разделы и этот.
      router.dismiss(2);
      return;
    }
    router.push(COMPOSER_ROUTE.title as never);
  };

  if (!composer.ready) return null;

  return (
    <ComposerScreen
      step="category"
      title={section?.name_ru ?? "Какая категория?"}
      onBack={nav.goBack}
      onClose={nav.close}
      hideActions
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("category", values)}
      onPrimary={nav.goNext}
    >
      <CategoryPickerTwoStep
        sections={l1.data ?? []}
        categories={categories.data ?? []}
        selectedL2Id={values.l2Id}
        openSectionId={sectionId}
        // Раздела с таким id нет (каталог изменился) — компонент покажет
        // список разделов; выбор из него переключает этот экран.
        onOpenSection={(id) => router.setParams({ id })}
        query=""
        onPick={onPick}
        loading={categories.isLoading || l1.isLoading}
        errorMessage={
          categories.error || l1.error
            ? "Не удалось загрузить категории. Проверьте связь."
            : undefined
        }
        onRetry={() => {
          void categories.refetch();
          void l1.refetch();
        }}
      />
    </ComposerScreen>
  );
}

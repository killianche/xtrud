/**
 * /orders/new/title — «Что нужно сделать?»: название задания одной строкой,
 * своими словами. Подпись над полем объясняет, что сюда писать (DECISION
 * владельца 2026-09-07: «чтобы было понятно, что туда вписывается»).
 */

import { Redirect } from "expo-router";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { isStepValid, normalizeTitle, TITLE_MAX, TITLE_MIN } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskTitleScreen() {
  const { values, patch } = useComposer();
  const nav = useStepNavigation("title");
  const categories = useVisibleCategories();
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const category = categories.data?.find((c) => c.id === values.l2Id);
  const trimmed = normalizeTitle(values.title);
  const titleError =
    trimmed.length > 0 && trimmed.length < TITLE_MIN ? `Минимум ${TITLE_MIN} символов` : null;

  return (
    <ComposerScreen
      step="title"
      title="Что нужно сделать?"
      subtitle={`Одной фразой, как сказали бы мастеру${category ? ` по категории «${category.name_ru}»` : ""}.`}
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("title", values)}
      onPrimary={() => {
        patch({ title: trimmed });
        nav.goNext();
      }}
    >
      <ComposerField
        label="Название задания"
        size="title"
        value={values.title}
        onChangeText={(t) => patch({ title: t.slice(0, TITLE_MAX) })}
        placeholder="Например, заменить смеситель на кухне"
        autoFocus={values.title.length === 0}
        returnKeyType="done"
        maxLength={TITLE_MAX}
        error={titleError}
        hint="Так задание будет называться в ленте у мастеров."
        accessibilityLabel="Название задания"
      />
    </ComposerScreen>
  );
}

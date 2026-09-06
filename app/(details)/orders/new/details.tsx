/**
 * /orders/new/details — «Расскажите подробнее»: описание (по желанию) с
 * подсказкой под категорию и до 5 фото. Шаг можно пропустить.
 */

import { Redirect } from "expo-router";
import { taskDetailsPrompt } from "@/features/orders/task-details-prompt";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { PhotoGrid } from "@/features/task-composer/PhotoGrid";
import { DESCRIPTION_MAX, isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskDetailsScreen() {
  const composer = useComposer();
  const { values, patch, photos, setPhotos } = composer;
  const nav = useStepNavigation("details");
  if (nav.needsIntent) return <Redirect href="/orders/new" />;

  const empty = values.description.trim().length === 0 && photos.length === 0;
  return (
    <ComposerScreen
      step="details"
      title="Расскажите подробнее"
      subtitle="Чем точнее описание, тем точнее цена в откликах. По желанию."
      onBack={nav.goBack}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("details", values)}
      onPrimary={() => {
        patch({ description: values.description.trim() });
        nav.goNext();
      }}
      secondaryLabel={empty && !nav.fromReview ? "Пропустить" : undefined}
      onSecondary={empty && !nav.fromReview ? nav.goNext : undefined}
    >
      <ComposerField
        multiline
        value={values.description}
        onChangeText={(t) => patch({ description: t.slice(0, DESCRIPTION_MAX) })}
        placeholder={taskDetailsPrompt(values.l2Id)}
        hint={
          values.description.length > DESCRIPTION_MAX - 200
            ? `${values.description.length} из ${DESCRIPTION_MAX}`
            : undefined
        }
        accessibilityLabel="Описание задания"
      />
      <PhotoGrid photos={photos} onChange={setPhotos} />
    </ComposerScreen>
  );
}

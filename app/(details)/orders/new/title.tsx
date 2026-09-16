/**
 * /orders/new/title — «Что нужно сделать?»: название, подробности и фото на
 * одном экране (владелец, 2026-09-13: «заголовок, подробное описание и
 * фотографии на одном экране»). Раньше описание и фото были отдельным шагом.
 * Подпись над полем объясняет, что сюда писать (DECISION 2026-09-07).
 */

import { Redirect } from "expo-router";
import { taskDetailsPrompt } from "@/features/orders/task-details-prompt";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { PhotoGrid } from "@/features/task-composer/PhotoGrid";
import {
  DESCRIPTION_MAX,
  isStepValid,
  normalizeTitle,
  TITLE_MAX,
  TITLE_MIN,
} from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskTitleScreen() {
  const { values, patch, photos, setPhotos } = useComposer();
  const nav = useStepNavigation("title");
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const trimmed = normalizeTitle(values.title);
  const titleError =
    trimmed.length > 0 && trimmed.length < TITLE_MIN ? `Минимум ${TITLE_MIN} символов` : null;

  return (
    <ComposerScreen
      step="title"
      title="Что нужно сделать?"
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("title", values)}
      onPrimary={() => {
        patch({ title: trimmed, description: values.description.trim() });
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
        accessibilityLabel="Название задания"
      />
      <ComposerField
        label="Подробности · по желанию"
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

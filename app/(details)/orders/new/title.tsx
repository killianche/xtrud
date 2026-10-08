/**
 * /orders/new/title — «Что нужно сделать?»: название, подробности и фото на
 * одном экране (владелец, 2026-09-13: «заголовок, подробное описание и
 * фотографии на одном экране»). Раньше описание и фото были отдельным шагом.
 * Подпись над полем объясняет, что сюда писать (DECISION 2026-09-07).
 * При первом экране «Что нужно сделать?» (№242) — заголовок «Подробности»,
 * название уже заполнено оттуда, клавиатура сама не открывается.
 */

import { Redirect } from "expo-router";
import { useRef } from "react";
import type { TextInput } from "react-native";
import { taskDetailsPrompt } from "@/features/orders/task-details-prompt";
import { useAppFlags } from "@/features/settings/use-app-flags";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { PhotoGrid } from "@/features/task-composer/PhotoGrid";
import {
  containsPhoneNumber,
  DESCRIPTION_MAX,
  isStepValid,
  normalizeTitle,
  PHONE_IN_TEXT_ERROR,
  TITLE_MAX,
  TITLE_MIN,
} from "@/features/task-composer/steps";
import { useFocusAfterTransition } from "@/features/task-composer/use-focus-after-transition";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskTitleScreen() {
  const { values, patch, photos, setPhotos } = useComposer();
  const nav = useStepNavigation("title");
  // При новом первом экране вопрос «Что нужно сделать?» уже задан, название
  // пришло оттуда — здесь подробности (№242). При откате — прежний заголовок.
  const quick = useAppFlags().composerStart === "quick";
  // Клавиатура — после того как экран доехал (иначе она серая в переходе).
  const titleRef = useRef<TextInput>(null);
  useFocusAfterTransition(titleRef, values.title.length === 0);
  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  const trimmed = normalizeTitle(values.title);
  const titleError =
    trimmed.length > 0 && trimmed.length < TITLE_MIN
      ? `Минимум ${TITLE_MIN} символов`
      : containsPhoneNumber(trimmed)
        ? PHONE_IN_TEXT_ERROR
        : null;

  return (
    <ComposerScreen
      step="title"
      title={quick ? "Подробности" : "Что нужно сделать?"}
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
        ref={titleRef}
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
        error={containsPhoneNumber(values.description) ? PHONE_IN_TEXT_ERROR : null}
        forceError
        accessibilityLabel="Описание задания"
      />
      <PhotoGrid photos={photos} onChange={setPhotos} />
    </ComposerScreen>
  );
}

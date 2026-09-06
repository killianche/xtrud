/**
 * Состояние конструктора задания.
 *
 * Создание: значения живут в owner-bound черновике (`useOrderDraftStore`) —
 * он переживает вход, перезапуск и смену аккаунта по своим правилам
 * (src/lib/order-draft-policy.ts), фото — только в памяти процесса.
 * Редактирование: значения опубликованного задания живут здесь, в памяти,
 * чтобы не смешиваться с черновиком нового задания.
 *
 * Экраны шагов работают через `useComposer()` и не знают, какой из двух
 * источников под ними.
 */

import { create } from "zustand";
import { hasDraftContent, type OrderDraftPhoto, useOrderDraftStore } from "@/lib/order-draft-store";
import { type ComposerValues, EMPTY_COMPOSER_VALUES, hasComposerContent } from "./steps";

export type ComposerMode = { kind: "create" } | { kind: "edit"; orderId: string };

/** Фото задания: локальное (uri file://) или уже загруженное (https://). */
export type ComposerPhoto = OrderDraftPhoto;

interface EditSessionState {
  mode: ComposerMode;
  values: ComposerValues;
  photos: ComposerPhoto[];
  /** Ответы на момент открытия редактирования — чтобы знать, есть ли правки. */
  initialValues: ComposerValues;
  initialPhotos: ComposerPhoto[];
  startEdit: (orderId: string, values: ComposerValues, photos: ComposerPhoto[]) => void;
  patchEdit: (patch: Partial<ComposerValues>) => void;
  setEditPhotos: (photos: ComposerPhoto[]) => void;
  endEdit: () => void;
}

export const useComposerSession = create<EditSessionState>((set) => ({
  mode: { kind: "create" },
  values: EMPTY_COMPOSER_VALUES,
  photos: [],
  initialValues: EMPTY_COMPOSER_VALUES,
  initialPhotos: [],
  startEdit: (orderId, values, photos) =>
    set({
      mode: { kind: "edit", orderId },
      values,
      photos,
      initialValues: values,
      initialPhotos: photos,
    }),
  patchEdit: (patch) => set((s) => ({ values: { ...s.values, ...patch } })),
  setEditPhotos: (photos) => set({ photos }),
  endEdit: () =>
    set({
      mode: { kind: "create" },
      values: EMPTY_COMPOSER_VALUES,
      photos: [],
      initialValues: EMPTY_COMPOSER_VALUES,
      initialPhotos: [],
    }),
}));

/** Есть ли в сессии редактирования несохранённые правки. */
export function isEditDirty(
  s: Pick<EditSessionState, "values" | "photos" | "initialValues" | "initialPhotos">,
): boolean {
  return (
    JSON.stringify(s.values) !== JSON.stringify(s.initialValues) ||
    s.photos.map((p) => p.uri).join("|") !== s.initialPhotos.map((p) => p.uri).join("|")
  );
}

export function isRemotePhoto(uri: string): boolean {
  return /^https?:/i.test(uri);
}

function draftToValues(draft: Partial<ComposerValues> & Record<string, unknown>): ComposerValues {
  return {
    l2Id: typeof draft.l2Id === "string" ? draft.l2Id : "",
    title: typeof draft.title === "string" ? draft.title : "",
    description: typeof draft.description === "string" ? draft.description : "",
    cityId: typeof draft.cityId === "string" ? draft.cityId : "",
    district: typeof draft.district === "string" ? draft.district : "",
    urgency: draft.urgency ?? null,
    preferredDate: typeof draft.preferredDate === "string" ? draft.preferredDate : null,
    budgetKind: draft.budgetKind ?? null,
    budgetValue: typeof draft.budgetValue === "number" ? draft.budgetValue : null,
    contactPhone: typeof draft.contactPhone === "string" ? draft.contactPhone : "",
    whatsappPhone: typeof draft.whatsappPhone === "string" ? draft.whatsappPhone : "",
    contactName: typeof draft.contactName === "string" ? draft.contactName : "",
  };
}

export interface Composer {
  mode: ComposerMode;
  values: ComposerValues;
  photos: ComposerPhoto[];
  /** Черновик и его владелец уже прочитаны с диска — можно судить о содержимом. */
  ready: boolean;
  hasContent: boolean;
  patch: (patch: Partial<ComposerValues>) => void;
  setPhotos: (photos: ComposerPhoto[]) => void;
}

export function useComposer(): Composer {
  const mode = useComposerSession((s) => s.mode);
  const editValues = useComposerSession((s) => s.values);
  const editPhotos = useComposerSession((s) => s.photos);
  const patchEdit = useComposerSession((s) => s.patchEdit);
  const setEditPhotos = useComposerSession((s) => s.setEditPhotos);

  const draft = useOrderDraftStore((s) => s.draft);
  const draftPhotos = useOrderDraftStore((s) => s.photos);
  const setDraft = useOrderDraftStore((s) => s.setDraft);
  const setDraftPhotos = useOrderDraftStore((s) => s.setPhotos);
  const hasHydrated = useOrderDraftStore((s) => s.hasHydrated);
  const activeOwnerId = useOrderDraftStore((s) => s.activeOwnerId);

  if (mode.kind === "edit") {
    return {
      mode,
      values: editValues,
      photos: editPhotos,
      ready: true,
      hasContent: hasComposerContent(editValues),
      patch: patchEdit,
      setPhotos: setEditPhotos,
    };
  }
  const values = draftToValues(draft as Partial<ComposerValues> & Record<string, unknown>);
  return {
    mode,
    values,
    photos: draftPhotos,
    ready: hasHydrated && activeOwnerId !== undefined,
    hasContent: hasDraftContent(draft),
    patch: setDraft,
    setPhotos: setDraftPhotos,
  };
}

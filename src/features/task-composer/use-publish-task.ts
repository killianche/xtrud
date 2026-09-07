/**
 * Публикация и сохранение задания из конструктора.
 *
 * Порядок при создании (как раньше, контракт безопасности не менялся):
 *   1. категория и место сверяются с сервером — встроенный каталог может
 *      устареть;
 *   2. лимит активных заданий (UX-проверка; мутация повторит её перед insert);
 *   3. фото загружаются в Storage; если хоть одно не загрузилось — задания
 *      нет, загруженные удаляются;
 *   4. insert; с этого момента задание владеет фото — никакая ошибка сессии
 *      их не удаляет и не разрешает второй insert (flight gate);
 *   5. владелец результата сверяется с активной сессией: результат аккаунта A
 *      не показывается в сессии B.
 * Редактирование: новые локальные фото загружаются, старые URL остаются.
 */

import { useRef, useState } from "react";
import {
  ActiveOrderLimitError,
  getOrderPublishCapacity,
} from "@/features/orders/order-publish-capacity";
import { orderPublishFailureMessage } from "@/features/orders/order-publish-error";
import { createOrderPublishFlightGate } from "@/features/orders/order-publish-flight";
import { resolveCommittedOrderPublishOwner } from "@/features/orders/order-publish-owner";
import { useCreateOrder } from "@/features/orders/use-create-order";
import { fetchActiveOrderCount } from "@/features/orders/use-order-publish-capacity";
import { useUpdateOrder } from "@/features/orders/use-update-order";
import {
  validateOrderPublishCategory,
  validateOrderPublishLocation,
} from "@/features/orders/validate-order-publish-category";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { deleteFromBucket, uploadOrderPhotosBatch } from "@/lib/image-upload";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { supabase } from "@/lib/supabase";
import { type ComposerMode, type ComposerPhoto, isRemotePhoto } from "./composer-store";
import type { ComposerValues } from "./steps";

export type PublishOutcome =
  | { kind: "published"; orderId: string | null }
  | { kind: "saved"; orderId: string };

export interface PublishTask {
  run: (userId: string, values: ComposerValues, photos: ComposerPhoto[]) => Promise<void>;
  busy: boolean;
  error: string | null;
  outcome: PublishOutcome | null;
  /** Категория устарела — вернуть человека к первому шагу. */
  categoryStale: boolean;
  clearError: () => void;
}

async function cleanupUploaded(paths: readonly string[]): Promise<void> {
  await Promise.allSettled(paths.map((path) => deleteFromBucket({ bucket: "order-photos", path })));
}

export function usePublishTask(mode: ComposerMode, activeUserId: string | undefined): PublishTask {
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PublishOutcome | null>(null);
  const [categoryStale, setCategoryStale] = useState(false);
  const gateRef = useRef(createOrderPublishFlightGate());
  const activeRef = useRef(activeUserId);
  activeRef.current = activeUserId;

  const run = async (uid: string, values: ComposerValues, photos: ComposerPhoto[]) => {
    if (!gateRef.current.tryEnter()) return;
    setBusy(true);
    setError(null);
    setCategoryStale(false);
    let uploadedPaths: string[] = [];
    let committed = false;
    try {
      if (values.urgency === null || values.budgetKind === null) {
        setError("Заполните обязательные ответы.");
        return;
      }
      const [categoryOk, locationOk] = await Promise.all([
        validateOrderPublishCategory(values.l2Id),
        validateOrderPublishLocation(values.cityId, values.district),
      ]);
      if (!categoryOk) {
        setCategoryStale(true);
        setError("Категория изменилась. Выберите её заново.");
        return;
      }
      if (!locationOk) {
        setError("Место задания изменилось. Выберите его заново.");
        return;
      }
      if (mode.kind === "create") {
        const capacity = getOrderPublishCapacity(await fetchActiveOrderCount(uid));
        if (!capacity.canPublish) throw new ActiveOrderLimitError(capacity.limit);
      }

      const local = photos.filter((p) => !isRemotePhoto(p.uri));
      const uploadedUrlById = new Map<string, string>();
      if (local.length > 0) {
        const results = await uploadOrderPhotosBatch(
          uid,
          local.map((p) => ({ uri: p.uri, width: p.width, height: p.height })),
        );
        uploadedPaths = results.flatMap((r) => (r.ok ? [r.path] : []));
        if (results.some((r) => !r.ok)) {
          await cleanupUploaded(uploadedPaths);
          uploadedPaths = [];
          setError("Не удалось загрузить фото. Попробуйте ещё раз.");
          return;
        }
        results.forEach((r, i) => {
          const photo = local[i];
          if (r.ok && photo) uploadedUrlById.set(photo.id, r.publicUrl);
        });
      }
      const photoUrls = photos
        .map((p) => (isRemotePhoto(p.uri) ? p.uri : (uploadedUrlById.get(p.id) ?? "")))
        .filter(Boolean);

      const common = {
        clientId: uid,
        l2Id: values.l2Id,
        title: values.title,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        whatsappPhone: values.whatsappPhone,
        contactMode: values.contactMode,
        description: values.description,
        cityId: values.cityId,
        district: values.district,
        urgency: values.urgency,
        preferredDate: values.preferredDate,
        budgetKind: values.budgetKind,
        budgetValue: values.budgetKind === "negotiable" ? null : values.budgetValue,
        photoUrls,
      };

      if (mode.kind === "edit") {
        await updateOrder.mutateAsync({ orderId: mode.orderId, ...common });
        committed = true;
        hapticSuccess();
        setOutcome({ kind: "saved", orderId: mode.orderId });
        return;
      }

      const created = await createOrder.mutateAsync(common);
      committed = true;
      hapticSuccess();
      uploadedPaths = [];
      useOrderDraftStore.getState().clearDraftForOwner(uid);
      const owner = await resolveCommittedOrderPublishOwner(uid, activeRef.current, async () => {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        return { userId: session?.user.id, error: sessionError };
      });
      if (owner === "mismatch") return;
      setOutcome({ kind: "published", orderId: owner === "confirmed" ? created.id : null });
    } catch (e) {
      if (committed) {
        if (activeRef.current === uid) {
          setOutcome(
            mode.kind === "edit"
              ? { kind: "saved", orderId: mode.orderId }
              : { kind: "published", orderId: null },
          );
        }
        return;
      }
      if (uploadedPaths.length > 0) await cleanupUploaded(uploadedPaths);
      hapticError();
      setError(
        e instanceof ActiveOrderLimitError
          ? `У вас уже ${e.limit} активных задания. Закройте одно, чтобы создать новое.`
          : orderPublishFailureMessage(e),
      );
    } finally {
      gateRef.current.leave();
      setBusy(false);
    }
  };

  return { run, busy, error, outcome, categoryStale, clearError: () => setError(null) };
}

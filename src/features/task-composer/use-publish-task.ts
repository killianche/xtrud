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
 *
 * Скорость (владелец, 2026-10-03: «выкладывается 5–10 секунд, должно
 * уходить моментально»): фото начинают загружаться заранее — экран
 * «Проверьте задание» вызывает prefetchPhotos при открытии; при публикации
 * проверки 1–2 идут параллельно с загрузкой, а не перед ней. Неиспользованные
 * заранее загруженные фото удаляются (discardPrefetched / после публикации).
 */

import { useRef, useState } from "react";
import { ActiveOrderLimitError } from "@/features/orders/order-publish-capacity";
import { orderPublishFailureMessage } from "@/features/orders/order-publish-error";
import { createOrderPublishFlightGate } from "@/features/orders/order-publish-flight";
import { resolveCommittedOrderPublishOwner } from "@/features/orders/order-publish-owner";
import { useCreateOrder } from "@/features/orders/use-create-order";
import { fetchOrderPublishCapacity } from "@/features/orders/use-order-publish-capacity";
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
import { type ComposerValues, effectiveWhatsapp } from "./steps";

export type PublishOutcome =
  | { kind: "published"; orderId: string | null }
  | { kind: "saved"; orderId: string };

type UploadResult = { ok: true; path: string; publicUrl: string } | { ok: false; error: string };

export interface PublishTask {
  run: (userId: string, values: ComposerValues, photos: ComposerPhoto[]) => Promise<void>;
  /** Начать загрузку локальных фото заранее (экран проверки). */
  prefetchPhotos: (userId: string, photos: ComposerPhoto[]) => void;
  /** Удалить заранее загруженные и не опубликованные фото. */
  discardPrefetched: () => void;
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
  // Заранее начатые загрузки: ключ — владелец и id фото.
  const preUploads = useRef(new Map<string, Promise<UploadResult>>());
  const photoKey = (uid: string, id: string) => `${uid}:${id}`;

  const prefetchPhotos = (uid: string, photos: ComposerPhoto[]) => {
    for (const p of photos) {
      if (isRemotePhoto(p.uri)) continue;
      const key = photoKey(uid, p.id);
      if (preUploads.current.has(key)) continue;
      preUploads.current.set(
        key,
        uploadOrderPhotosBatch(uid, [{ uri: p.uri, width: p.width, height: p.height }]).then(
          (r) => r[0] ?? { ok: false, error: "no result" },
          (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        ),
      );
    }
  };

  /** Удалить загруженное заранее, кроме путей keep (их уже владеет задание). */
  const discardPrefetchedExcept = (keep: ReadonlySet<string>) => {
    const pending = [...preUploads.current.values()];
    preUploads.current.clear();
    void Promise.all(pending).then((results) =>
      cleanupUploaded(results.flatMap((r) => (r.ok && !keep.has(r.path) ? [r.path] : []))),
    );
  };

  const run = async (uid: string, values: ComposerValues, photos: ComposerPhoto[]) => {
    if (!gateRef.current.tryEnter()) return;
    setBusy(true);
    setError(null);
    setCategoryStale(false);
    let uploadedPaths: string[] = [];
    let committed = false;
    try {
      // Бюджет необязателен: пусто — договорная (DECISION владельца
      // 2026-09-12). Обязателен только срок.
      if (values.urgency === null) {
        setError("Заполните обязательные ответы.");
        return;
      }
      // Проверки и загрузка фото — одновременно (раньше загрузка ждала проверок).
      const local = photos.filter((p) => !isRemotePhoto(p.uri));
      prefetchPhotos(uid, local);
      const uploadsPromise = Promise.all(
        local.map(
          (p) =>
            preUploads.current.get(photoKey(uid, p.id)) ??
            Promise.resolve<UploadResult>({ ok: false, error: "missing upload" }),
        ),
      );
      const [[categoryOk, locationOk], capacity, results] = await Promise.all([
        Promise.all([
          // Все категории задания должны быть живыми, не только основная.
          Promise.all(
            [values.l2Id, ...values.extraL2Ids].map((id) => validateOrderPublishCategory(id)),
          ).then((r) => r.every(Boolean)),
          validateOrderPublishLocation(values.cityId, values.district, undefined, values.village),
        ]),
        mode.kind === "create" ? fetchOrderPublishCapacity(uid) : Promise.resolve(null),
        uploadsPromise,
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
      if (capacity && !capacity.canPublish) throw new ActiveOrderLimitError(capacity.limit);

      const uploadedUrlById = new Map<string, string>();
      uploadedPaths = results.flatMap((r) => (r.ok ? [r.path] : []));
      if (results.some((r) => !r.ok)) {
        // Неудачные — забыть, чтобы «Опубликовать» ещё раз загрузил их заново.
        results.forEach((r, i) => {
          const photo = local[i];
          if (!r.ok && photo) preUploads.current.delete(photoKey(uid, photo.id));
        });
        setError("Не удалось загрузить фото. Попробуйте ещё раз.");
        uploadedPaths = [];
        return;
      }
      results.forEach((r, i) => {
        const photo = local[i];
        if (r.ok && photo) uploadedUrlById.set(photo.id, r.publicUrl);
      });
      const photoUrls = photos
        .map((p) => (isRemotePhoto(p.uri) ? p.uri : (uploadedUrlById.get(p.id) ?? "")))
        .filter(Boolean);

      const common = {
        clientId: uid,
        l2Id: values.l2Id,
        extraL2Ids: values.extraL2Ids,
        title: values.title,
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        whatsappPhone: effectiveWhatsapp(values),
        contactMode: values.contactMode,
        address: values.address,
        description: values.description,
        cityId: values.cityId,
        district: values.district,
        village: values.village,
        urgency: values.urgency,
        preferredDate: values.preferredDate,
        budgetKind: values.budgetValue === null ? "negotiable" : (values.budgetKind ?? "fixed"),
        budgetValue: values.budgetValue,
        photoUrls,
      };

      if (mode.kind === "edit") {
        await updateOrder.mutateAsync({ orderId: mode.orderId, ...common });
        committed = true;
        discardPrefetchedExcept(new Set(uploadedPaths));
        hapticSuccess();
        setOutcome({ kind: "saved", orderId: mode.orderId });
        return;
      }

      const created = await createOrder.mutateAsync(common);
      committed = true;
      discardPrefetchedExcept(new Set(uploadedPaths));
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
      // Загруженные фото остаются в кэше предзагрузки: повторная попытка
      // возьмёт их, а уход с экрана удалит (discardPrefetched).
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

  return {
    run,
    prefetchPhotos,
    discardPrefetched: () => discardPrefetchedExcept(new Set()),
    busy,
    error,
    outcome,
    categoryStale,
    clearError: () => setError(null),
  };
}

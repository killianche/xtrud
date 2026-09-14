/**
 * orderStatusView — единственный источник статуса задания/отклика для
 * приложения. Заменяет четыре независимых места, которые рисовали один и тот
 * же факт разными цветами (docs/ORDER_STATUS_DESIGN.md §1.2): `clientOrderTone`
 * и `masterOrderTone` (order-card-tone.ts), `responseStatusView`
 * ([id].tsx), `STYLES` (OrderStatusBadge.tsx) и `historyResponseStatusLabel`
 * (use-my-responses.ts).
 *
 * Правило источника (§2): на экране виден не `order.status` напрямую, а
 * производный «взгляд» — что это значит для конкретного человека сейчас.
 * Функция принимает роль и статус и возвращает готовый к рендеру набор:
 * тон карточки (архив/не архив — секция списка и приглушение), тон и текст
 * пилюли, ключ иконки. Единый рендер-компонент — `StatusPill`
 * (`src/components/StatusPill.tsx`), он же резолвит `iconKey` в реальный
 * Phosphor-компонент.
 *
 * Иконка — КЛЮЧ (`StatusIconKey`), не сам React-компонент Phosphor: этот
 * модуль — чистая логика без единого UI-импорта, чтобы `npm test` мог
 * проверить все ветки таблиц §2.1/§2.2 без прогона через React Native/Metro.
 * `phosphor-react-native` внутри содержит Flow-синтаксис (`import typeof`),
 * который esbuild/vitest не парсит вне RN-рантайма — раньше в тестируемых
 * .ts-модулях иконки поэтому не жили (order-card-tone.ts хранил только
 * className), здесь по той же причине — ключ, а не компонент.
 *
 * Таблицы состояний — DECISION владельца 2026-09-13/2026-09-14:
 *   §2.1 (заказчик), §2.2 (специалист) в docs/ORDER_STATUS_DESIGN.md.
 *
 * Тон пилюли — 4 значения, не 3, как в черновике §3.4: спецификация сначала
 * предложила «neutral/confirmed/archive» (+ зарезервированный «problem»), но
 * решение владельца от 2026-09-14 («красный XCircle — только у заказчика на
 * „Закрыто“; у специалиста то же задание — серый») требует отдельного цвета
 * ИМЕННО для этого одного случая — карточка при этом всё равно архивная, как
 * у любого закрытого задания. Раскрашивать это через ad-hoc if в компоненте
 * рендера было бы тем самым «расхождением», которое эта задача устраняет,
 * поэтому это четвёртое значение тона, а не разовое исключение.
 */

import type { Tables } from "@/types/database";

export type OrderStatusValue = Tables<"orders">["status"];
export type ResponseStatusValue = Tables<"order_responses">["status"];

export type PillTone = "neutral" | "confirmed" | "archive" | "cancelled";

/** 4 уникальных глифа системы (§3.1.1) — CheckCircle / XCircle /
 *  ClockCountdown / ArrowUUpLeft. Цвет решает `pillTone`, не иконка: один и
 *  тот же XCircle бывает и красным («Закрыто» у заказчика), и серым
 *  («Отклонён», «Выбран другой» у специалиста). */
export type StatusIconKey = "check" | "cancel" | "expired" | "undo";

export interface OrderStatusView {
  /** Карточка уходит в архивную секцию списка и приглушается (opacity). */
  cardArchived: boolean;
  /** Тон пилюли — определяет цвет фона/текста в StatusPill. */
  pillTone: PillTone;
  /** Текст пилюли. */
  label: string;
  /** Ключ иконки слева от текста — StatusPill резолвит его в Phosphor,
   *  цвет — тот же, что у текста (§3.1.1). undefined у "neutral" — состояние
   *  ещё не требует внимания, значка нет. */
  iconKey?: StatusIconKey;
  /** Насыщенность иконки (§3.1.1): большинство — "fill", `undo`
   *  («Отозван») — единственная "bold" (залитая версия читается хуже). */
  iconWeight: "fill" | "bold";
  /** VoiceOver — сейчас совпадает с текстом пилюли: сам текст уже описывает
   *  факт однозначно, дополнительный контекст добавлять не нужно (§7,
   *  OrderRow строит общий accessibilityLabel карточки вокруг этого текста). */
  accessibilityLabel: string;
}

export interface OrderStatusViewInput {
  role: "client" | "master";
  /** `picked_master_id` в структуре умышленно нет: "выбрали меня" для роли
   *  master решает `myResponseStatus === 'accepted'` (см. комментарий у
   *  переменной `chosenMe` ниже), а роль client его не использует вовсе —
   *  сравнивать id независимо от этого поля не нужно ни для одной ветки. */
  order: { status: OrderStatusValue };
  /** Статус СВОЕГО отклика — обязателен для role: "master". */
  myResponseStatus?: ResponseStatusValue;
}

function view(
  cardArchived: boolean,
  pillTone: PillTone,
  label: string,
  iconKey?: StatusIconKey,
): OrderStatusView {
  const iconWeight = iconKey === "undo" ? "bold" : "fill";
  return { cardArchived, pillTone, label, iconKey, iconWeight, accessibilityLabel: label };
}

export function orderStatusView(input: OrderStatusViewInput): OrderStatusView {
  const { role, order } = input;

  if (role === "client") {
    switch (order.status) {
      case "open":
        // Есть отклики или нет — счётчик живёт в подвале карточки
        // (OrderRow, уже реализовано), отдельного цвета пилюли не требует.
        return view(false, "neutral", "Открыто");
      case "in_progress":
      case "awaiting_confirmation":
        return view(false, "confirmed", "Исполнитель выбран", "check");
      case "completed":
        // Карточка архивная (прошлое), пилюля зелёная (единственный случай
        // «архив снаружи + цветная плашка внутри», §3.1).
        return view(true, "confirmed", "Завершено", "check");
      case "cancelled":
        // Красный XCircle — только у заказчика (DECISION 2026-09-14).
        return view(true, "cancelled", "Закрыто", "cancel");
      case "expired":
        return view(true, "archive", "Истекло", "expired");
      case "draft":
        // До публикации, в списках не показывается вовсе — сюда попадает
        // только если что-то отрендерило черновик по ошибке.
        return view(true, "archive", "Черновик");
      default:
        // Легаси/непредвиденный статус (disputed и т.п., §1.1 — недостижимо
        // из текущего приложения, но встречается в старых данных). Не
        // подписываем его конкретным словом, которого не подтверждают данные
        // («Черновик» тут было бы неправдой) — нейтральное «Закрыто», без
        // иконки, архивный тон (design-quality §5 — честность интерфейса).
        return view(true, "archive", "Закрыто");
    }
  }

  // role === "master"
  //
  // "Выбрали меня" определяется ТОЛЬКО статусом своего отклика: `accepted`
  // ставится сервером (pick_order_master, 0196) исключительно тому отклику,
  // который клиент выбрал — сравнивать `order.picked_master_id` с id мастера
  // не нужно, входной интерфейс (§3.4) его для этого и не передаёт.
  const myResponseStatus = input.myResponseStatus;
  const chosenMe = myResponseStatus === "accepted";

  switch (order.status) {
    case "in_progress":
    case "awaiting_confirmation":
      if (chosenMe) return view(false, "confirmed", "Вы исполнитель", "check");
      // Выбрали другого — моё дело здесь закрыто, даже если заказ ещё идёт.
      return view(true, "archive", "Выбран другой", "cancel");
    case "completed":
      if (chosenMe) return view(true, "confirmed", "Вы выполнили", "check");
      return view(true, "archive", "Выбран другой", "cancel");
    case "cancelled":
    case "expired":
      if (chosenMe) {
        // Единый лейбл «Отменено» для обеих причин (§2.2), иконка отличает
        // истечение срока от явной отмены — серая в обоих случаях
        // (красный XCircle — привилегия заказчика, не специалиста).
        return view(true, "archive", "Отменено", order.status === "expired" ? "expired" : "cancel");
      }
      return order.status === "expired"
        ? view(true, "archive", "Истекло", "expired")
        : view(true, "archive", "Задание закрыто", "cancel");
    case "open":
      if (myResponseStatus === "rejected") return view(true, "archive", "Отклонён", "cancel");
      if (myResponseStatus === "withdrawn") return view(true, "archive", "Отозван", "undo");
      if (myResponseStatus === "viewed") return view(false, "neutral", "Клиент прочитал");
      return view(false, "neutral", "Отклик отправлен");
    case "draft":
      // Черновик — не опубликован, специалист не может иметь на него отклик;
      // сюда попадает только по ошибке рендера, тон/подпись — как у клиента.
      return view(true, "archive", "Черновик");
    default:
      // Легаси/непредвиденный статус — та же логика честности, что у клиента.
      return view(true, "archive", "Закрыто");
  }
}

// Человеческий текст вместо кода ошибки сервера.
//
// ЗАЧЕМ (FACT, 2026-09-05). Владелец отозвал отклик и увидел на экране строку
// `cannot_withdraw_after_decision`. Это внутренний код из функции базы —
// человеку он не говорит ничего и выглядит как поломка приложения.
//
// Так было не в одном месте: пятнадцать экранов печатали `error.message`
// как есть. Пока сервер отвечает по-русски, это незаметно; как только
// срабатывает техническая проверка — на экран попадает латиница.
//
// Правило простое: если сообщение выглядит как код (латиница, цифры и
// подчёркивания, без пробелов) — это не текст для человека. Известные коды
// переводим, неизвестные заменяем нейтральной фразой, а сам код оставляем
// только в журнале разработчика.
//
// Сообщения на русском проходят насквозь: функции базы часто уже пишут
// готовую фразу («Аккаунт ограничен…»), и переписывать её незачем.

/** Коды, до которых человек реально может дойти в приложении. */
const KNOWN: Record<string, string> = {
  // Отклики
  cannot_withdraw_after_decision: "Этот отклик уже нельзя отозвать.",
  cannot_respond_to_own_order: "Нельзя откликнуться на собственное задание.",
  daily_response_limit_reached: "На сегодня отклики закончились. Попробуйте завтра.",
  response_not_found: "Отклик не найден — возможно, он уже отозван.",
  not_response_owner: "Это чужой отклик.",
  response_contacts_incomplete: "Оставьте телефон или WhatsApp, иначе с вами не свяжутся.",
  order_response_l2_mismatch: "Задание из другой категории.",

  // Задания
  order_not_found: "Задание не найдено.",
  order_not_open: "Задание уже закрыто.",
  order_not_reopenable: "Это задание нельзя открыть заново.",
  reopen_window_expired: "Срок, в который задание можно было вернуть, истёк.",
  not_order_owner: "Это чужое задание.",
  not_order_participant: "У вас нет доступа к этому заданию.",
  order_not_in_active_state: "С заданием в этом состоянии так поступить нельзя.",
  order_l3_ids_required: "Выберите хотя бы одну услугу.",
  order_l3_limit_exceeded: "Слишком много услуг в одном задании.",
  order_l3_not_in_l2: "Услуга не из выбранной категории.",
  order_primary_l3_not_selected: "Выберите основную услугу.",
  order_location_city_and_district_are_mutually_exclusive:
    "Укажите либо город, либо район — не оба сразу.",

  // Аккаунт и доступ
  not_authenticated: "Нужно войти в аккаунт.",
  unauthorized: "Нужно войти в аккаунт.",
  forbidden: "Действие недоступно.",
  user_not_found: "Аккаунт не найден. Войдите заново.",
  user_deleted: "Аккаунт удалён.",
  master_profile_missing: "Профиль исполнителя ещё не создан.",
  username_taken: "Такое имя уже занято.",
  username_invalid: "Имя можно составить из латинских букв, цифр и нижнего подчёркивания.",
  username_already_set: "Имя уже выбрано, его нельзя поменять.",
  password_too_short: "Пароль слишком короткий.",

  // Лимиты
  too_many_categories: "Выбрано слишком много категорий.",
  max_5_categories_per_master: "Больше 5 категорий выбрать нельзя.",
  max_20_services_per_master: "Больше 20 услуг добавить нельзя.",
  max_12_portfolio_items_per_master: "Больше 12 работ загрузить нельзя.",
  max_50_portfolio_items_per_master: "Больше 50 работ загрузить нельзя.",

  // Жалобы и споры
  report_not_found: "Жалоба не найдена.",
  reason_required: "Укажите причину.",
  reason_too_long: "Причина слишком длинная.",
  dispute_reason_too_short: "Опишите проблему подробнее.",
  dispute_reason_too_long: "Описание слишком длинное.",
  cannot_dispute_in_current_state: "Спор сейчас открыть нельзя.",
};

/** Похоже ли сообщение на внутренний код, а не на фразу для человека. */
export function looksLikeErrorCode(message: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(message.trim());
}

/**
 * Текст ошибки, который можно показать на экране.
 *
 * @param fallback что сказать, если код неизвестен. У каждого экрана своя
 *        формулировка: «Не удалось отозвать отклик», «Не удалось сохранить».
 */
export function describeServerError(error: unknown, fallback: string): string {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message ?? "")
      : String(error ?? "");
  const message = raw.trim();
  if (message.length === 0) return fallback;

  const known = KNOWN[message];
  if (known) return known;

  // Неизвестный код на экран не пускаем: человеку он ничего не объясняет.
  // В журнал разработчика — пускаем, иначе разбирать будет нечего.
  if (looksLikeErrorCode(message)) {
    console.warn(`[server] неизвестный код ошибки: ${message}`);
    return fallback;
  }

  return message;
}

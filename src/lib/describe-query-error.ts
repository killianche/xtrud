// Человеческий текст ошибки загрузки для экранов.
//
// DECISION владельца 2026-09-03: «если ошибка — понятный retry, не серые
// полоски». Раньше экраны печатали `error.message` как есть, а это
// техническая строка вроде «FetchError: …» или «TypeError: Network request
// failed» — она ничего не объясняет и пугает.
//
// Здесь ровно два случая, которые пользователь может отличить по смыслу:
// нет связи (запрос не дошёл или сервер молчал) и сбой на стороне сервиса.
// Больше вариантов не выдумываем: точную причину мы всё равно не знаем.

import { isNetworkTransportError } from "@/lib/network-transport-error";

export interface QueryErrorText {
  title: string;
  hint: string;
  /** true — виноват канал связи, а не сервис. Влияет только на текст. */
  offline: boolean;
}

export function describeQueryError(error: unknown): QueryErrorText {
  if (isNetworkTransportError(error)) {
    return {
      title: "Нет связи",
      hint: "Проверьте интернет и повторите — данные загрузятся сразу.",
      offline: true,
    };
  }
  return {
    title: "Не удалось загрузить",
    hint: "Сервис не ответил. Попробуйте ещё раз.",
    offline: false,
  };
}

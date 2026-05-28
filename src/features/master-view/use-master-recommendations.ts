/**
 * useMasterRecommendations — общий клиентский хук для всех «подборок» на
 * главной мастера (Подобрали для вас / Срочно сегодня / Свежие за сутки).
 *
 * Why (2026-05-28). После того как «Ваши отклики» уехали с главной мастера
 * на отдельный экран /orders/my-responses (фидбэк владельца: мастер на главной
 * ищет новые заказы, а не следит за уже отправленными откликами), главная
 * стала «дискавери-витриной». Витрине нужно НЕСКОЛЬКО подборок, иначе пустой
 * экран после геро-фото. DoorDash / Yelp / Whatnot тоже верстают home как
 * стэк коротких лент с разной выборкой по одному фиду — это паттерн.
 *
 * Один RPC и один кэш-ключ (`useAllOpenOrders` с `sort: 'newest'`) обслуживает
 * ВСЕ три подборки. Фильтрация — на клиенте, без новых endpoints. Иначе три
 * параллельных запроса с почти-одинаковыми параметрами били бы по БД зря и
 * усложняли реалтайм-инвалидацию (правило connect-the-dots.md — не плодим
 * data-слой когда хватает одного).
 *
 * Алгоритм (общий для всех trio):
 *   1. Берём все open-заказы по L2-категориям мастера (useAllOpenOrders).
 *   2. Из useMyResponses → Set order_id где мастер уже откликался (любой
 *      статус, включая withdrawn — повторно показывать смысла нет).
 *   3. Применяем `filter` (см. ниже).
 *   4. Сортируем по `sort` и берём первые `MAX_ITEMS`.
 *
 * filter:
 *   - 'all' — без доп. условий, просто свежие сверху (это подборка
 *     «Подобрали для вас»).
 *   - 'urgent' — только заказы с `urgency='urgent'` (это «Срочно сегодня»).
 *     В БД urgency-enum = 'urgent' | 'this_week' | 'this_month' | 'flexible';
 *     именно 'urgent' значит «прямо сейчас, сегодня» — в UI и копирайте
 *     это «Срочно». См. order-schema.ts (`urgencyLabel`).
 *   - 'fresh_24h' — заказы с `created_at >= now() - 24h` (это «Свежие за
 *     сутки»). Подсветка свежего притока — паттерн «Recently added» у
 *     marketplace-фидов (Vinted/eBay).
 *
 * Empty state:
 *   - Хук возвращает `recommendations: []` и `isLoading`/`hasCategories`.
 *     Решение «рендерить ли секцию» — на стороне компонента-обёртки.
 *     Если нет категорий или 0 рекомендаций — секция возвращает null
 *     (никакого «Скоро будут рекомендации»-шума).
 *
 * Не делаем (осознанно):
 *   - Новых RPC / миграций — лишнее.
 *   - Серверной фильтрации по urgency/created_at внутри useAllOpenOrders —
 *     иначе сломаем единый кэш-ключ /orders/search и инвалидации станут хрупкими.
 */

import { useMemo, useRef } from "react";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { useMyResponses } from "@/features/orders/use-my-responses";

export type MasterRecommendationsFilter = "all" | "urgent" | "fresh_24h";

interface UseMasterRecommendationsInput {
  userId: string;
  /** Какую подборку готовим. См. шапку файла. */
  filter: MasterRecommendationsFilter;
  /** Сколько строк показывать максимум. Дефолт 5 — компактная лента-витрина. */
  max?: number;
}

interface UseMasterRecommendationsResult {
  /** Отфильтрованные и отсортированные заказы, ≤ max. */
  recommendations: OrderWithRefs[];
  /** true пока тянутся категории мастера, его отклики или сам фид. */
  isLoading: boolean;
  /** false если у мастера 0 категорий — обёртка-секция не должна рендериться. */
  hasCategories: boolean;
  /** АКТУАЛЬНЫЙ набор order_id, на которые мастер откликнулся (включая только
   *  что отправленный отклик). Компонент использует его, чтобы на карточке
   *  показать чип «Вы откликнулись» вместо кнопки «Откликнуться». */
  respondedOrderIds: Set<string>;
}

/** Окно «свежести» для filter='fresh_24h» в миллисекундах. */
const FRESH_24H_MS = 24 * 60 * 60 * 1000;

export function useMasterRecommendations({
  userId,
  filter,
  max = 5,
}: UseMasterRecommendationsInput): UseMasterRecommendationsResult {
  // 1. Категории мастера → l2Ids для фильтра ленты.
  const { data: myCats, isLoading: catsLoading } = useMyMasterCategories(userId);
  const l2Ids = useMemo(
    () => (myCats ?? []).map((c) => c.l2_id).filter(Boolean),
    [myCats],
  );
  const hasCategories = l2Ids.length > 0;

  // 2. Отклики мастера. Нужны в ДВУХ ролях:
  //    a) АКТУАЛЬНЫЙ набор (respondedOrderIds) — чтобы карточка показывала чип
  //       «Вы откликнулись» сразу после отклика.
  //    b) СНИМОК на момент входа (initialRespondedRef) — для фильтрации списка.
  //       Why (фидбэк владельца 2026-05-28): раньше после отклика карточка
  //       МГНОВЕННО исчезала из подборки (фильтр убирал откликнутые), и мастер,
  //       вернувшись назад, не понимал куда делась карточка. Теперь заказы,
  //       откликнутые ВО ВРЕМЯ текущего просмотра, ОСТАЮТСЯ в списке (с чипом
  //       «Вы откликнулись»), а исчезают только при следующем полном обновлении
  //       (reload / новый заход). Паттерн «sticky after action» как в
  //       Twitter/Instagram (лайкнул пост — он не пропадает из ленты).
  const { data: myResponses, isLoading: respLoading } = useMyResponses(userId);
  const respondedOrderIds = useMemo(
    () => new Set((myResponses ?? []).map((r) => r.response.order_id)),
    [myResponses],
  );

  // Снимок откликнутых ID при первой успешной загрузке откликов. Заполняется
  // ровно один раз (init-once pattern, допустимо в теле рендера). Заказы из
  // этого снимка НЕ показываются вовсе (мастер откликнулся ДО входа). Отклики,
  // сделанные позже в этой сессии, в снимок не попадают → карточка остаётся.
  const initialRespondedRef = useRef<Set<string> | null>(null);
  if (initialRespondedRef.current === null && !respLoading) {
    initialRespondedRef.current = new Set(
      (myResponses ?? []).map((r) => r.response.order_id),
    );
  }
  const initialResponded = initialRespondedRef.current;

  // 3. Open-заказы по категориям мастера. ВСЕГДА sort='newest' — у нас один
  //    кэш-ключ на все 3 подборки, локальная сортировка на клиенте при
  //    необходимости (для 'urgent' и так подходит newest, для остальных тоже).
  const { data: feed, isLoading: feedLoading } = useAllOpenOrders({
    userId,
    l2Ids: hasCategories ? l2Ids : null,
    sort: "newest",
  });

  // 4. Применяем фильтр + ограничиваем размер.
  //    Исключаем по СНИМКУ (initialResponded), а не по актуальному набору —
  //    иначе свежий отклик мгновенно убирал бы карточку. Пока снимок ещё не
  //    готов (respLoading) — initialResponded=null, не фильтруем по откликам
  //    (список появится через миг, когда снимок снимется).
  const recommendations = useMemo(() => {
    if (!hasCategories) return [];
    const rows = (feed?.pages ?? []).flatMap((p) => p.rows);

    // Базовая фильтрация: не показывать заказы, откликнутые ДО входа (снимок).
    let filtered = initialResponded
      ? rows.filter((o) => !initialResponded.has(o.id))
      : rows;

    if (filter === "urgent") {
      filtered = filtered.filter((o) => o.urgency === "urgent");
    } else if (filter === "fresh_24h") {
      const cutoff = Date.now() - FRESH_24H_MS;
      filtered = filtered.filter((o) => {
        const t = Date.parse(o.created_at);
        return Number.isFinite(t) && t >= cutoff;
      });
    }
    // 'all' — без доп. условий, оставляем как есть.

    return filtered.slice(0, max);
    // initialResponded — ref-снимок (стабилен после первого заполнения);
    // respLoading в deps, чтобы пересчитать ровно когда снимок снялся.
  }, [feed, initialResponded, hasCategories, filter, max, respLoading]);

  const isLoading = catsLoading || respLoading || feedLoading;

  return { recommendations, isLoading, hasCategories, respondedOrderIds };
}

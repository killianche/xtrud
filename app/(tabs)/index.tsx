/**
 * Главная клиента — выбор варианта по флагу `home_variant` (0205/0216,
 * `useAppFlags`): `"v2"` (по умолчанию, docs/HOME_V2_2026-10.md, №353) или
 * `"classic"` — точка откатa без новой сборки. Сам вариант экрана —
 * `src/features/home/HomeV2.tsx` / `ClassicHome.tsx`; этот файл — только
 * маршрутизация.
 *
 * Auth-логика (общая для обоих вариантов):
 *   - Анон может всё смотреть.
 *   - Тап «Создать задание» → /orders/new (на финальной отправке login wall)
 *   - Тап карточки исполнителя → /master/[id]
 *
 * Одна главная на всех ролей. DECISION владельца 2026-09-01: есть аккаунт, с
 * него можно выложить задание и откликнуться на чужое; отдельного «режима
 * мастера» нет — лента открытых заданий — это блок «Актуальные задания»,
 * который есть здесь, а «Найти задание» — отдельная вкладка нижнего меню.
 */

import { useRouter } from "expo-router";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { ClassicHome } from "@/features/home/ClassicHome";
import { HomeV2 } from "@/features/home/HomeV2";
import { useAppFlags } from "@/features/settings/use-app-flags";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export default function HomeTab() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const refresh = usePullToRefresh();
  const { homeVariant } = useAppFlags();

  const onDescribeTask = (draft?: string) => {
    // Передаём текст черновика в визард — orders/new подхватит его как
    // начальное значение поля description.
    const url = draft ? `/orders/new?draft=${encodeURIComponent(draft)}` : "/orders/new";
    router.push(url as never);
  };

  const Home = homeVariant === "classic" ? ClassicHome : HomeV2;
  return <Home userId={userId} refresh={refresh} onDescribeTask={onDescribeTask} />;
}

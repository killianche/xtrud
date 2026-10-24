/**
 * Хук пошагового заполнения профиля (№362), логика — в profile-fill-flow.ts.
 * `flow` — null, если экран открыт не из карточки «Вы специалист?»: тогда
 * экран ведёт себя как раньше, а `next()` просто закрывает его.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { nextFillHref, parseFillFlow } from "@/features/specialist/profile-fill-flow";

export function useProfileFillFlow() {
  const router = useRouter();
  const { fill, fillOf } = useLocalSearchParams<{ fill?: string; fillOf?: string }>();
  const flow = useMemo(() => parseFillFlow(fill, fillOf), [fill, fillOf]);

  const next = useCallback(() => {
    const href = flow ? nextFillHref(flow) : null;
    if (href) router.replace(href as never);
    else router.back();
  }, [flow, router]);

  return { flow, next };
}

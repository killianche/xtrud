/**
 * AvailabilitySwitcher — компонент для master home: мастер ставит/меняет
 * статус готовности (today / this_week / next_week / unavailable).
 *
 * Один тап — RPC set_availability → оптимистичное обновление профиля.
 * Под активным статусом — countdown «до 06:00» или «до воскресенья».
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { supabase } from "@/lib/supabase";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_SHORT,
  type AvailabilityStatus,
  effectiveStatus,
  useSetAvailability,
} from "./availability";

const OPTIONS: AvailabilityStatus[] = ["today", "this_week", "next_week", "unavailable"];

interface MyAvailability {
  availability_status: AvailabilityStatus;
  availability_until: string | null;
}

function useMyAvailability(userId: string | undefined) {
  return useQuery<MyAvailability | null>({
    queryKey: ["my-master-profile", userId, "availability"],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select("availability_status, availability_until")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as MyAvailability | null) ?? null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
}

/** «след. неделе» → «След. неделе». Только первая буква в заглавную, остальное
 *  как есть (важно, потому что точка в «след.» сохраняется). */
function capitalizeFirst(s: string): string {
  if (!s) return s;
  return (s.charAt(0).toUpperCase() ?? "") + s.slice(1);
}

function formatCountdown(until: string | null | undefined): string | null {
  if (!until) return null;
  const dt = new Date(until);
  const now = new Date();
  if (dt.getTime() < now.getTime()) return "истёк";
  const sameDay = dt.toDateString() === now.toDateString();
  if (sameDay) {
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `до ${hh}:${mm}`;
  }
  const diffDays = Math.ceil((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return "до завтра";
  return `до ${dt.getDate()}.${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export function AvailabilitySwitcher({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: my } = useMyAvailability(userId);
  const setAvailability = useSetAvailability();

  const current = effectiveStatus(my?.availability_status, my?.availability_until);
  const countdown = formatCountdown(my?.availability_until);

  const handlePress = (status: AvailabilityStatus) => {
    if (setAvailability.isPending) return;
    if (status === current) return;
    setAvailability.mutate(status, {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["my-master-profile", userId, "availability"] }),
    });
  };

  return (
    <View>
      {/* Header: «Статус» (укоротили с «Ваш статус») + countdown в моно.
          Меньше визуального шума, в стиле HUD заголовков игр. */}
      <View className="flex-row items-baseline justify-between">
        <AppText weight="semibold" className="text-body-sm text-mute uppercase tracking-widest">
          Статус
        </AppText>
        {countdown ? (
          <AppText weight="mono" className="text-mono-caption text-mute">
            {countdown}
          </AppText>
        ) : null}
      </View>

      {/* Horizontal chip-row (game-style activity selector а-ля Strava/Fitness):
          4 compact pill'а в одну строку, h-9, scrollable horizontal если узко.
          Active = solid accent fill + bright dot + on-primary text (filled chip),
          inactive = canvas-soft + outline dot + mute text. По фидбэку user
          2026-05-16 «сделай в игровом стиле, компактнее» — заменил 2×2 grid
          h-12 (~120px суммарно) на single row h-9 (~36px). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingRight: 8 }}
      >
        <View className="flex-row gap-2">
          {OPTIONS.map((status) => {
            const isActive = status === current;
            const dotColor = AVAILABILITY_DOT[status];
            return (
              <Pressable
                key={status}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => handlePress(status)}
                disabled={setAvailability.isPending}
                // Active: «приподнятый» surface — bg-canvas + лёгкая тень,
                // без border-кольца. Inactive: bg-canvas-soft (погружён) +
                // тонкий hairline. Контраст surface + bold text + bright dot.
                // Фидбэк user 2026-05-16: «не нравится чёрная обводка».
                className={`h-9 flex-row items-center gap-2 rounded-pill px-3.5 active:opacity-70 ${
                  isActive
                    ? "border border-hairline bg-canvas"
                    : "border border-hairline bg-canvas-soft"
                }`}
                style={
                  isActive
                    ? {
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.06,
                        shadowRadius: 2,
                        elevation: 1,
                      }
                    : undefined
                }
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: dotColor,
                    opacity: isActive ? 1 : 0.5,
                  }}
                />
                <AppText
                  weight={isActive ? "semibold" : "medium"}
                  className={`text-body-sm ${
                    isActive ? "text-ink" : "text-mute"
                  }`}
                  numberOfLines={1}
                >
                  {capitalizeFirst(AVAILABILITY_SHORT[status])}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      {setAvailability.isError ? (
        <AppText className="mt-2 text-caption text-error">
          Не удалось обновить статус. Попробуйте ещё раз.
        </AppText>
      ) : null}
    </View>
  );
}

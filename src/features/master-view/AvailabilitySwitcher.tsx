/**
 * AvailabilitySwitcher — компонент для master home: мастер ставит/меняет
 * статус готовности (today / this_week / next_week / unavailable).
 *
 * Один тап — RPC set_availability → оптимистичное обновление профиля.
 * Под активным статусом — countdown «до 06:00» или «до воскресенья».
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { supabase } from "@/lib/supabase";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABELS,
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
      <AppText weight="semibold" className="text-title-md text-ink">
        Ваш статус
      </AppText>
      <AppText className="mt-1 text-body-sm text-muted">
        Клиенты видят что вы готовы взять заказ. Сбрасывается автоматически.
      </AppText>

      <View className="mt-3 rounded-xl border border-hairline bg-canvas">
        {OPTIONS.map((status, idx) => {
          const isActive = status === current;
          const isLast = idx === OPTIONS.length - 1;
          return (
            <Pressable
              key={status}
              onPress={() => handlePress(status)}
              disabled={setAvailability.isPending}
              className={`flex-row items-center gap-3 px-4 py-3 active:opacity-70 ${
                isLast ? "" : "border-b border-hairline"
              }`}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: AVAILABILITY_DOT[status],
                  opacity: isActive ? 1 : 0.35,
                }}
              />
              <View className="flex-1">
                <AppText
                  weight={isActive ? "semibold" : "regular"}
                  className="text-body-md text-ink"
                >
                  {AVAILABILITY_LABELS[status]}
                </AppText>
                {isActive && countdown ? (
                  <AppText className="text-caption-xs text-muted mt-0.5">{countdown}</AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      {setAvailability.isError ? (
        <AppText className="mt-2 text-caption text-error">
          Не удалось обновить статус. Попробуйте ещё раз.
        </AppText>
      ) : null}
    </View>
  );
}

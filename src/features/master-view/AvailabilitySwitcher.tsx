/**
 * AvailabilitySwitcher — мастер ставит/меняет статус готовности
 * (today / this_week / next_week / unavailable).
 *
 * Один тап — RPC set_availability → оптимистичное обновление профиля.
 *
 * ── Редизайн 2026-05-24 (компактный выпадающий список) ─────────────────────
 * Раньше 4 чипа в сетке 2×2 занимали много места в верхней сводке. По фидбэку
 * владельца («сделать компактным, выпадающим списком») заменено на:
 *   - свёрнутый триггер (точка статуса + текущий статус + caret) — одна строка;
 *   - по тапу разворачивается inline-список из 4 вариантов (точка + подпись +
 *     галочка на текущем); тап по варианту — выставляет статус и сворачивает.
 * Inline-раскрытие (а не overlay/portal) — без z-index артефактов на web.
 *
 * ── Редизайн 2026-05-24 (часть верхней сводки «убрать лишнее») ──────────────
 * Убран отдельный uppercase-заголовок «ГОТОВНОСТЬ К ЗАКАЗАМ» — лишний третий
 * «голос» в сводке. Сам триггер с зелёной точкой и текстом «Готов сегодня»
 * самоочевиден, отдельная шапка не нужна (design-quality §G — без шумных
 * заголовков-секций над самоочевидным контролом). Countdown «до 06:00» теперь
 * тихой подписью внутри триггер-строки справа, перед caret — не отдельной
 * строкой-шапкой. Контрол стал единственным элементом блока.
 *
 * ── Редизайн 2026-05-29 (#160 «галочки/выделения некрасивые») ───────────────
 * Тонкая bold-Check у выбранного варианта заменена на круглый filled-индикатор
 * (bg-primary + Check в on-primary) — тот же визуальный язык, что у PickerSheet.
 * Выбранная строка: мягкая подсветка bg-canvas-soft + semibold-label + круглый
 * индикатор справа. Цветная точка статуса (AVAILABILITY_DOT) сохранена — это
 * смысловой сигнал «зелёный = доступен / жёлтый = подождать / серый = нет».
 * Контраст индикатора 4.5:1 в обеих темах (правило §A).
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CaretDown, CaretUp, Check } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABELS,
  type AvailabilityStatus,
  effectiveStatus,
  useSetAvailability,
} from "./availability";

// Порядок: срочные статусы → нейтральный «Не указан» → «Не доступен».
const OPTIONS: AvailabilityStatus[] = [
  "today",
  "this_week",
  "next_week",
  "unspecified",
  "unavailable",
];

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

/** Цветная точка статуса. backgroundColor берётся из AVAILABILITY_DOT (переменная,
 *  не литерал-hex в JSX → не нарушает design-enforcement §B). */
function Dot({ color, dim }: { color: string; dim?: boolean }) {
  return (
    <View
      style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: dim ? 0.6 : 1 }}
    />
  );
}

/** Круглый индикатор «выбрано»: bg-primary + Check в on-primary. Тот же
 *  визуальный язык, что у PickerSheet. Контраст 4.5:1 в обеих темах (§A). */
function SelectedMark({ onPrimaryColor }: { onPrimaryColor: string }) {
  return (
    <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-primary">
      <Check size={13} weight="bold" color={onPrimaryColor} />
    </View>
  );
}

export function AvailabilitySwitcher({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const { data: my } = useMyAvailability(userId);
  const setAvailability = useSetAvailability();
  const tc = useThemeColors(["mute", "on-primary"]);
  const [open, setOpen] = useState(false);

  const current = effectiveStatus(my?.availability_status, my?.availability_until);
  const countdown = formatCountdown(my?.availability_until);

  const handlePick = (status: AvailabilityStatus) => {
    setOpen(false);
    if (setAvailability.isPending) return;
    if (status === current) return;
    setAvailability.mutate(status, {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: ["my-master-profile", userId, "availability"],
        }),
    });
  };

  return (
    <View>
      {/* Свёрнутый триггер — одна строка: статус + countdown тихой подписью +
          caret. Без отдельного uppercase-заголовка над ним. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="Изменить готовность к заказам"
        onPress={() => setOpen((v) => !v)}
        disabled={setAvailability.isPending}
        className="h-12 flex-row items-center gap-2.5 rounded-lg border border-hairline bg-canvas px-3.5 active:opacity-70"
      >
        <Dot color={AVAILABILITY_DOT[current]} />
        <AppText weight="semibold" className="flex-1 text-body-md text-ink" numberOfLines={1}>
          {AVAILABILITY_LABELS[current]}
        </AppText>
        {countdown ? (
          <AppText weight="mono" className="text-caption text-mute">
            {countdown}
          </AppText>
        ) : null}
        {open ? (
          <CaretUp size={18} weight="bold" color={tc.mute} />
        ) : (
          <CaretDown size={18} weight="bold" color={tc.mute} />
        )}
      </Pressable>

      {/* Раскрытый список вариантов (inline, без overlay). */}
      {open ? (
        <View className="mt-1.5 overflow-hidden rounded-lg border border-hairline bg-canvas">
          {OPTIONS.map((status, i) => {
            const isActive = status === current;
            return (
              <Pressable
                key={status}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => handlePick(status)}
                disabled={setAvailability.isPending}
                className={`h-12 flex-row items-center gap-3 px-3.5 active:bg-canvas-soft ${
                  i > 0 ? "border-t border-hairline" : ""
                } ${isActive ? "bg-canvas-soft" : ""}`}
              >
                <Dot color={AVAILABILITY_DOT[status]} dim={!isActive} />
                <AppText
                  weight={isActive ? "semibold" : "medium"}
                  className="flex-1 text-body-md text-ink"
                  numberOfLines={1}
                >
                  {AVAILABILITY_LABELS[status]}
                </AppText>
                {isActive ? <SelectedMark onPrimaryColor={tc["on-primary"]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {setAvailability.isError ? (
        <AppText className="mt-2 text-caption text-error">
          Не удалось обновить статус. Попробуйте ещё раз.
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * OrderDateSheet — контент выбора конкретной даты заказа («К дате»).
 *
 * Триггер — chip «К дате» в форме заказа (`OrderFormBody`, блок «Сроки»).
 * Раньше был `BottomSheet` (самописный full-screen `<Modal>`); теперь —
 * контент отдельного route-экрана `app/(details)/orders/date-select.tsx` с
 * нативной iOS `formSheet`-модальностью (`docs/IOS_FOUNDATION.md` §2.4):
 * выбор параметра/подтверждение → `formSheet`, а не самописный лист.
 * Presentation/detents задаёт `Stack.Screen` route'а. Handshake результата —
 * `useOrderDatePickerStore`, `OrderFormBody` слушает store и применяет выбор
 * в react-hook-form (см. `LocationPicker.tsx` — тот же паттерн).
 *
 * Почему свой календарь на чистом RN, а не библиотека:
 *   - В проекте нет date-picker зависимостей и ставить их не нужно.
 *   - Нативный <DateTimePicker> выглядит по-разному на iOS/Android и не
 *     поддаётся Vercel-токенам (цвета системные). Свой компонент даёт единый
 *     вид и работает через NativeWind className.
 *   - Вся дата-логика — на голом JS (Date / Intl.DateTimeFormat ru-RU).
 *
 * UX-паттерн (Lazyweb: NHL / WeWork / Lumy single-day pickers):
 *   - Заголовок месяца слева + стрелки ‹ › справа (Phosphor CaretLeft/Right).
 *   - Сетка Пн–Вс (понедельник первый, как принято в RU).
 *   - Прошедшие дни приглушены и не нажимаемы (минимум — сегодня).
 *   - Выбранный день — solid bg-accent + белый текст; сегодня — мягкое кольцо
 *     border-accent (отличимо от выбранного).
 *   - Быстрые пилюли «Сегодня» / «Завтра» (большинство «к дате» — ближайшие дни).
 *   - Один primary внизу — «Готово», активен только когда дата выбрана.
 *   - Закрытие без «Готово» (X в header) = отмена, черновик не коммитится.
 */

import { CaretLeft, CaretRight, X } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";

export interface OrderDateSheetProps {
  /** Выбранная дата yyyy-mm-dd или null. */
  value: string | null;
  /** Вернуть выбранную дату yyyy-mm-dd (тап «Готово»). */
  onSelect: (isoDate: string) => void;
  /** Закрыть route без коммита (X в header, тоже вызывается после «Готово»). */
  onClose: () => void;
}

// Пн-первый порядок недели для RU.
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

/** yyyy-mm-dd без сдвига таймзоны (берём локальные компоненты, не toISOString). */
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Локальная дата из yyyy-mm-dd (00:00 локально, без сдвига таймзоны). */
function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Дата без времени (00:00 локально) для сравнения «прошёл ли день». */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Индекс дня недели 0..6, где 0 = понедельник (JS getDay(): 0=Вс). */
function mondayFirstIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/**
 * Ячейки сетки месяца: ведущие null'ы под пустые клетки до 1-го числа,
 * затем все дни месяца. Хвост не добиваем — ряд просто короче.
 */
function buildMonthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const lead = mondayFirstIndex(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(year, month, day));
  return cells;
}

// Только название месяца (год добавляем сами) — иначе Intl даёт «Май 2026 г.»
// с лишним суффиксом «г.». Нужен формат «Май 2026».
const monthNameFmt = new Intl.DateTimeFormat("ru-RU", { month: "long" });

export function OrderDateSheet({ value, onSelect, onClose }: OrderDateSheetProps) {
  const insets = useSafeAreaInsets();
  // Phosphor SVG-иконки красятся прокинутым цветом, не className.
  const inkHex = useThemeColor("ink");
  const tc = useThemeColors(["mute"]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }, [today]);

  // Выбранная дата — черновик внутри route'а. Коммитится в форму только по
  // «Готово» (тап по дню лишь подсвечивает). Закрытие без «Готово» = отмена.
  // Route монтируется заново на каждое открытие — инициализация из `value`
  // достаточна, отдельный reset-эффект (как было у `visible`-driven Modal) не нужен.
  const [selected, setSelected] = useState<Date | null>(value ? fromIso(value) : null);
  // Видимый месяц. Если дата выбрана — открываемся на её месяце, иначе на текущем.
  const initialMonth = value ? fromIso(value) : today;
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth());

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth]);

  // Текущий месяц — самый ранний доступный. Стрелку «назад» на нём гасим.
  const isAtCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function goPrev() {
    if (isAtCurrentMonth) return; // не уходим в прошлое
    const m = viewMonth - 1;
    if (m < 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth(m);
    }
  }

  function goNext() {
    const m = viewMonth + 1;
    if (m > 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth(m);
    }
  }

  function pickQuick(d: Date) {
    // Перепрыгиваем на месяц быстрой даты и выбираем.
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelected(d);
  }

  function confirm(date: Date | null) {
    if (!date) return;
    onSelect(toIso(date));
    onClose();
  }

  const monthTitle = useMemo(() => {
    const name = monthNameFmt.format(new Date(viewYear, viewMonth, 1));
    // «июнь» → «Июнь 2026» (Intl даёт строчную первую букву).
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${viewYear}`;
  }, [viewYear, viewMonth]);

  const selectedIso = selected ? toIso(selected) : null;
  const todayIso = toIso(today);
  const isTodayQuick = selectedIso === todayIso;
  const isTomorrowQuick = selectedIso === toIso(tomorrow);

  return (
    <View className="flex-1 bg-canvas">
      {/* Header: title + close-X — тот же стиль, что у `PickerSheetPage`
          (bold title слева, лёгкий X справа), для единого вида formSheet-контента. */}
      <View className="flex-row items-center gap-3 px-5 py-3">
        <AppText
          weight="bold"
          className="flex-1 text-display-sm tracking-tight text-ink"
          numberOfLines={1}
        >
          Выберите дату
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft"
        >
          <X size={22} weight="bold" color={tc.mute} />
        </Pressable>
      </View>
      <View className="h-px bg-hairline mx-4" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Шапка месяца: название слева, стрелки ‹ › справа (NHL/Lumy паттерн). */}
        <View className="mt-2 flex-row items-center justify-between">
          <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
            {monthTitle}
          </AppText>
          <View className="flex-row items-center gap-1">
            <MonthArrow dir="prev" disabled={isAtCurrentMonth} onPress={goPrev} color={inkHex} />
            <MonthArrow dir="next" disabled={false} onPress={goNext} color={inkHex} />
          </View>
        </View>

        {/* Заголовки дней недели Пн–Вс. */}
        <View className="mt-4 flex-row">
          {WEEKDAY_LABELS.map((w) => (
            <View key={w} className="flex-1 items-center">
              <AppText weight="medium" className="text-caption text-mute">
                {w}
              </AppText>
            </View>
          ))}
        </View>

        {/* Сетка дней — 7 колонок. */}
        <View className="mt-2 flex-row flex-wrap">
          {cells.map((date, idx) => {
            if (!date) {
              // Пустая клетка до 1-го числа.
              return (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: пустые ведущие клетки стабильны по позиции
                  key={`empty-${idx}`}
                  style={{ width: `${100 / 7}%` }}
                  className="aspect-square items-center justify-center"
                />
              );
            }
            const iso = toIso(date);
            const isPast = date.getTime() < today.getTime();
            const isSelected = iso === selectedIso;
            const isToday = iso === todayIso;
            return (
              <View
                key={iso}
                style={{ width: `${100 / 7}%` }}
                className="aspect-square items-center justify-center p-1"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isPast }}
                  accessibilityLabel={iso}
                  disabled={isPast}
                  onPress={() => setSelected(date)}
                  className={`h-10 w-10 items-center justify-center rounded-full border ${
                    isSelected
                      ? "border-accent bg-accent"
                      : isToday
                        ? "border-accent bg-canvas active:opacity-70"
                        : "border-transparent bg-canvas active:opacity-60"
                  }`}
                >
                  <AppText
                    weight={isSelected || isToday ? "semibold" : "medium"}
                    className={`text-body-md ${
                      isSelected
                        ? "text-on-primary"
                        : isPast
                          ? "text-muted-soft"
                          : isToday
                            ? "text-accent"
                            : "text-ink"
                    }`}
                  >
                    {date.getDate()}
                  </AppText>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Быстрый выбор: Сегодня / Завтра (WeWork/Lumy). */}
        <View className="mt-6 flex-row gap-2">
          <QuickPill label="Сегодня" active={isTodayQuick} onPress={() => pickQuick(today)} />
          <QuickPill label="Завтра" active={isTomorrowQuick} onPress={() => pickQuick(tomorrow)} />
        </View>
      </ScrollView>

      {/* Один primary внизу — подтверждение выбора. Активен только при выбранной дате. */}
      <View
        className="border-t border-hairline px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          disabled={!selected}
          onPress={() => confirm(selected)}
          className={`h-14 items-center justify-center rounded-full ${
            selected ? "bg-primary active:opacity-80" : "bg-canvas-soft-2"
          }`}
        >
          <AppText
            weight="semibold"
            className={`text-button-lg ${selected ? "text-on-primary" : "text-muted-soft"}`}
          >
            Готово
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------

function MonthArrow({
  dir,
  disabled,
  onPress,
  color,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onPress: () => void;
  /** Резолвленный hex (ink по теме) — CSS-vars в Modal портале не работают. */
  color: string;
}) {
  const Icon = dir === "prev" ? CaretLeft : CaretRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir === "prev" ? "Предыдущий месяц" : "Следующий месяц"}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      className={`h-10 w-10 items-center justify-center rounded-full border border-hairline ${
        disabled ? "opacity-30" : "bg-canvas active:opacity-60"
      }`}
    >
      {/* Иконка красится прокинутым hex (выключенная гасится opacity-30 обёртки). */}
      <Icon size={20} weight="bold" color={color} />
    </Pressable>
  );
}

function QuickPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`h-11 items-center justify-center rounded-pill border px-5 ${
        active ? "border-accent bg-accent-soft" : "border-hairline bg-canvas active:opacity-70"
      }`}
    >
      <AppText weight="medium" className={`text-body-md ${active ? "text-accent" : "text-ink"}`}>
        {label}
      </AppText>
    </Pressable>
  );
}

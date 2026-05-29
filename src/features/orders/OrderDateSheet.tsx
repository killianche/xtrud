/**
 * OrderDateSheet — выбор конкретной даты заказа («К дате»).
 *
 * Открывается из формы заказа (OrderFormBody, блок «Сроки»), когда клиент
 * хочет указать точный день вместо относительного срока. Возвращает дату в
 * формате yyyy-mm-dd через onSelect; хранится в orders.preferred_date.
 *
 * Почему свой календарь на чистом RN, а не библиотека:
 *   - В проекте нет date-picker зависимостей и ставить их не нужно.
 *   - Нативный <DateTimePicker> выглядит по-разному на web/iOS/Android и не
 *     поддаётся Vercel-токенам (цвета системные). Свой компонент даёт единый
 *     вид во всех трёх средах и работает через NativeWind className.
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
 */

import { CaretLeft, CaretRight } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useColorScheme, useDomColorScheme } from "@/hooks/use-color-scheme";
import { darkColors, lightColors } from "@/lib/colors";

export interface OrderDateSheetProps {
  visible: boolean;
  /** Выбранная дата yyyy-mm-dd или null. */
  value: string | null;
  /** Вернуть выбранную дату yyyy-mm-dd. */
  onSelect: (isoDate: string) => void;
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

export function OrderDateSheet({ visible, value, onSelect, onClose }: OrderDateSheetProps) {
  // Phosphor SVG-иконки красятся прокинутым цветом, не className. Внутри Modal
  // портала RNW CSS-vars (`rgb(var(--ink))`) не резолвятся — поэтому берём
  // готовый hex из палитры по фактической теме (как делает сам BottomSheet).
  const isWeb = Platform.OS === "web";
  const domScheme = useDomColorScheme();
  const { colorScheme: nativeScheme } = useColorScheme();
  const scheme = isWeb ? domScheme : nativeScheme;
  const inkHex = (scheme === "dark" ? darkColors : lightColors).ink;

  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }, [today]);

  // Выбранная дата — черновик внутри шита. Коммитится в форму только по «Готово»
  // (тап по дню лишь подсвечивает). Закрытие через back-кнопку = отмена.
  const [selected, setSelected] = useState<Date | null>(value ? fromIso(value) : null);
  // Видимый месяц. Если дата выбрана — открываемся на её месяце, иначе на текущем.
  const initialMonth = value ? fromIso(value) : today;
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth());

  // При каждом открытии сбрасываем черновик к закоммиченному значению формы и
  // прыгаем на его месяц. Иначе уйдёт рассинхрон: отменили выбор back-кнопкой,
  // открыли снова — а внутри остался прошлый незакоммиченный день.
  useEffect(() => {
    if (!visible) return;
    const base = value ? fromIso(value) : today;
    setSelected(value ? fromIso(value) : null);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    // today стабилен (useMemo []), value меняется при коммите — синк ровно когда нужно.
  }, [visible, value, today]);

  const cells = useMemo(() => buildMonthCells(viewYear, viewMonth), [viewYear, viewMonth]);

  // Текущий месяц — самый ранний доступный. Стрелку «назад» на нём гасим.
  const isAtCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

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
    <BottomSheet open={visible} onClose={onClose} title="Выберите дату">
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
      <View className="border-t border-hairline px-5 pt-3">
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
    </BottomSheet>
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

# Дизайн-качество (приоритет 1, после working-rules)

## TL;DR

Каждый экран и компонент должен выглядеть **финально**, а не «лишь бы работало». Не делай stub-дизайн в надежде «доработать потом» — пользователь увидит именно эту версию. Уровень — Vercel / Linear / Stripe / Airbnb, не «студенческий MVP».

## ⚡ Pre-commit чек-лист (10 секунд)

Перед закрытием задачи прогнать в голове:

1. **Контраст текста на цветных фонах:** на каждый `bg-primary` / `bg-error` / `bg-success` есть `text-on-primary` рядом? Если нет — баг.
2. **Никаких inline `style={{color:"#..."}}` / `backgroundColor:"#..."`** — только className с токенами.
3. **Минимум 12px шрифт** — нет `text-caption-xs`, нет `fontSize: 10`.
4. **Phosphor, не Lucide** — `lucide-react-native` импорт в новом файле = баг.
5. **Mutex-выборы сбрасывают друг друга** — если «либо A, либо B», выбор одного обнуляет другое.
6. **Никаких пустых onPress / `Alert.alert("Скоро")`** — либо реальная фича, либо контрол скрыт.
7. **Никаких subtitle под заголовками** — `ScreenHeader.subtitle` / `BottomSheet.subtitle` / любые «помогающие» captions под H1 в Vercel-стиле запрещены. Title должен быть самоочевидным.

Если хоть один пункт не пройден — это **баг, не «по дизайну»**. Подробности — §«ЖЁСТКИЕ ПРАВИЛА КОНТРАСТА» ниже.

## Контракт

Перед закрытием любой UI-задачи (новый экран, новый компонент, существенная правка) **обязательно**:

### 1. Lazyweb FIRST — всегда

Перед написанием UI-кода: сделай 1-3 Lazyweb-запроса с конкретным описанием экрана/компонента/паттерна. Изучи минимум 3-5 скриншотов. Не «потому что и так знаю». Пиши в отчёте: «искал X, посмотрел N, переиспользую паттерны A/B, осознанно делаю иначе C».

Когда **не** нужно: тривиальная правка одного слова, цвета токена, отступа.

### 2. DESIGN.md — единственный источник истины по стилю

- Цвета — токены из `colors.ts` через **NativeWind className** (`bg-canvas`, `text-ink`, `border-hairline`). Не inline `style={{color:"#fff"}}` — он не работает в RNW с CSS-vars и ломает dark mode.
- Радиусы — `rounded-md` (8) / `rounded-lg` (12, дефолт карточек) / `rounded-xl` (16, hero/special) / `rounded-full` (pill).
- Шрифты — `<AppText weight="..." />` с правильным weight. Шрифт **системный** (SF Pro / Segoe / Roboto, с 2026-05-23 — Geist убран). `mono` weight (системный моноширинный) для метрик «★ 4.9», «1 200 ₽», «12 км».
- Spacing — Tailwind scale (mt-2/3/4/6/8/10/12). Между секциями hero — mt-10 или mt-12. Внутри секции элементы — gap-2/3.
- Иконки — **Phosphor React Native** (`phosphor-react-native`) для нового UI-кода. Размер 18-20 (inline) / 22-24 (кнопки, chip) / 26 (TabBar) / 28 (ScreenHeader back) / 32+ (hero). Weight: `bold` (inactive) / `fill` (active/selected/status). Lucide — только legacy, не использовать в новом коде. Полная инструкция и маппинг Lucide → Phosphor — [`docs/UI_ICONS.md`](../../docs/UI_ICONS.md). Цветные иконки L2-категорий — [`docs/ICONS.md`](../../docs/ICONS.md) (Iconify CDN, не Phosphor).

### 3. Hierarchy — один primary action

На экране **один** главный visual-anchor (search bar / CTA / hero image). Secondary actions — outline-кнопки или ghost-links, **меньше по visual weight**. Не «5 одинаково ярких кнопок».

Иерархия типа:
1. **Primary**: bg-primary, h-12-14, pill, размер lg
2. **Secondary**: bg-canvas + border-hairline, h-10-12, pill, размер md
3. **Tertiary / Ghost**: text-link или без бордера, ghost
4. **Caption / hint**: text-mute / body-sm

### 4. Spacing и воздух

- Между крупными секциями (hero → list → footer): **mt-10 или mt-12**
- Внутри секции (title → content): **mt-3 или mt-4**
- Между элементами одной группы: **gap-2 или gap-3**
- Никогда **не клади 4+ блока вплотную** — добавь воздух

### 5. Empty / loading / error states

Каждый экран с данными:
- **Loading**: skeleton (`<Skeleton>` или `bg-canvas-soft-2` блоки правильных размеров), **не** `<ActivityIndicator>` на пустом экране
- **Empty**: иллюстрация (иконка 48px) + заголовок + объясняющий текст + CTA (если применимо)
- **Error**: иконка + понятный текст + кнопка «Повторить»

Никогда не показывай **пустой экран без объяснения** — это выглядит как ошибка приложения.

### 6. Текст

- **H1**: короткий, продающий, без вопросов. «Найдутся мастера», не «С чего начнём?»
- **Subtitle**: 1 предложение, без bold-фрагментов на короткой фразе. Если фраза длинная (2+ предложения) — может быть bold ключевой части.
- **Buttons**: 2-3 слова, активный залог. «Написать задачу», не «Создать новую задачу с описанием».
- **Placeholders**: реалистичные примеры, не «введите текст». «Сантехник, электрик, плитка…» лучше «поиск».
- **Empty states**: «Здесь будут N когда X», не «список пуст».

### 7. Никаких stub'ов в финальном виде

Запрещено в production-ready коде:
- «// TODO: add real design later»
- Кнопки без onPress (или с `() => {}`) кроме явных placeholders
- Параграфы lorem ipsum в любом виде
- Цвета вне токенов colors.ts (`#ff0000` написанное как fallback)
- Хардкод-fallback'ы с английским текстом в русском интерфейсе

Если что-то stub'ится — явно отметь в отчёте «⚠️ stub, нужна доработка» и заведи задачу в TASKS.md.

### 8. Dark theme — обязательно

Все компоненты должны работать в обеих темах. Тестируй переключением темы (через ThemeSwitcher в /profile). Bg-canvas / text-ink / border-hairline через NativeWind className решают это автоматически, если не нарушать правило №2.

### 9. Verification перед закрытием задачи

Не пиши «✅ сделано» если не **видел экран глазами** в preview. Делай скриншот через `preview_screenshot` ИЛИ minimum `preview_eval` с `document.body.innerText` чтобы проверить что текст рендерится.

Если уровень тестирования был только static (`tsc --noEmit`) — отметь это в отчёте: «написано, не запускалось в preview».

### 10. Чек-лист перед commit

- [ ] Lazyweb-запрос сделан, паттерны изучены, выводы записаны
- [ ] Цвета только из colors.ts через className
- [ ] Hierarchy: один primary, остальные secondary/ghost
- [ ] Spacing между секциями ≥ mt-10
- [ ] Empty / loading / error states покрыты
- [ ] Тексты человеческие, короткие, активные
- [ ] Dark mode проверен
- [ ] Скриншот сделан, выглядит финально
- [ ] TS clean (`npx tsc --noEmit`)

## Anti-patterns которых избегаем

- ❌ «Avito-style» — много мелкого текста, цветные бейджи везде, рекламные баннеры в feed
- ❌ Stub-серость — серые квадраты без иконок/контента
- ❌ Web-1.0 — синие text-link'и вместо кнопок, центрированные блоки текста
- ❌ Overengineering — 5 фильтров когда нужно 2, dropdown с 20 опций когда нужно 4 chip'а
- ❌ MVP-styled — «потом доделаю» эстетика, half-finished components

## 🚨 ЖЁСТКИЕ ПРАВИЛА КОНТРАСТА (П0, без исключений)

Эти правила нарушаются регулярно и приводят к **невидимым** кнопкам и тексту. Если их не соблюдать — пользователь не видит CTA, проваливает регистрацию, не может отменить заказ. Каждое нарушение в коде = баг.

### A. `bg-primary` (или любой цветной фон) ⇒ `text-on-primary` обязательно

Класс `text-button` и `text-button-lg` в [`tailwind.config.ts`](../../tailwind.config.ts) определяют **только fontSize/lineHeight**, цвет НЕ задан. По умолчанию RN ставит `text-ink` (чёрный). Это значит:

```tsx
// ❌ ЗАПРЕЩЕНО — чёрный текст на чёрном фоне, пользователь НЕ видит надпись:
<Pressable className="h-12 bg-primary">
  <AppText className="text-button-lg">Опубликовать заказ</AppText>
</Pressable>

// ✅ ПРАВИЛЬНО — явный контрастный токен:
<Pressable className="h-12 bg-primary">
  <AppText className="text-button-lg text-on-primary">Опубликовать заказ</AppText>
</Pressable>
```

Те же правила для `bg-error`, `bg-success`, `bg-warning`, `bg-info`. Любой цветной фон → текст внутри `text-on-primary` (= white в light, ink в dark — гарантированный контраст 4.5:1).

**Проверка перед commit:**
```bash
grep -rn "bg-primary\|bg-error\|bg-success" app/ src/ --include="*.tsx" |
  grep -v "text-on-primary\|text-on-error\|text-on-success" |
  head -5
```
Если что-то нашлось без `text-on-*` в той же строке/рядом — это баг.

### B. Никаких inline `style={{color:"#hex"}}` / `backgroundColor`

NativeWind className даёт CSS-vars, которые правильно переключаются между light/dark и через ThemeSwitcher. Inline hex это ломает.

```tsx
// ❌ ЗАПРЕЩЕНО:
<Text style={{ color: "#fff" }}>Привет</Text>
<View style={{ backgroundColor: "#1a1a1a" }}>...</View>

// ✅ ПРАВИЛЬНО:
<AppText className="text-on-primary">Привет</AppText>
<View className="bg-surface-dark">...</View>
```

**Исключения** (явно допустимые):
- Hero-overlay `bg-black/50` через alpha modifier (`<View className="bg-black/50">`).
- SVG-иконка из Phosphor (`<Heart color={tc.warning} />` ← это берёт значение из useThemeColors).
- `+html.tsx` — корневые web-only meta-теги.

### C. Минимальный размер шрифта — 12px

```tsx
// ❌ ЗАПРЕЩЕНО:
<AppText className="text-caption-xs">...</AppText>   // 10px, нечитаемо
<Text style={{ fontSize: 10 }}>...</Text>

// ✅ ПРАВИЛЬНО:
<AppText className="text-caption">...</AppText>           // 12px
<AppText className="text-mono-caption">...</AppText>      // 12px моно (для цифр)
```

Если строка не помещается — `numberOfLines={1}` + `flex-shrink`, **не уменьшай шрифт**.

### D. Иконки — только Phosphor React Native

```tsx
// ❌ ЗАПРЕЩЕНО (в новом коде):
import { ChevronLeft, Info } from "lucide-react-native";

// ✅ ПРАВИЛЬНО:
import { CaretLeft, Info } from "phosphor-react-native";
```

Lucide остаётся **только** в `src/lib/category-icons.ts` как legacy (постепенно мигрируется). Любой новый компонент с Lucide — нарушение. Phosphor weight: `bold` (inactive) / `fill` (active/selected). Маппинг — [`docs/UI_ICONS.md`](../../docs/UI_ICONS.md).

### E. Mutually exclusive selects — radio-семантика, не checkbox

Если выбор «либо A, либо B» (мастер либо в районе, либо в конкретном селе; цена либо фикс, либо договорная) — то выбор одного **сбрасывает** другие. Иначе пользователь делает невозможный выбор (записан и район Назрановский, и село Плиево одновременно — что значит?).

```tsx
// ❌ ЗАПРЕЩЕНО:
setSelectedDistrict("nazranovsky");
setSelectedCity("plievo");          // оба активны, конфликт

// ✅ ПРАВИЛЬНО:
function selectDistrict(d) {
  setSelectedDistrict(d);
  setSelectedCity(null);             // сбросили mutex-партнёра
}
function selectCity(c) {
  setSelectedCity(c);
  setSelectedDistrict(null);
}
```

### G. НИКАКИХ subtitle под заголовками экранов и шитов

Vercel / Linear / Stripe принципиально не пишут «помогающий» текст под H1 — он визуально шумит и снижает доверие. Если заголовок не самоочевиден — переписать заголовок, **не добавлять подзаголовок**.

```tsx
// ❌ ЗАПРЕЩЕНО:
<ScreenHeader
  title="Где находится задача"
  subtitle="Выберите либо город, либо район. Можно покрыть всю Ингушетию."
/>
<BottomSheet
  title="Этот мастер выполнил работу?"
  subtitle="Опишите что сделал Хава Аушева. Это поможет другим клиентам."
/>
<View>
  <AppText>Вся Ингушетия</AppText>
  <AppText className="text-caption text-mute">Заказ увидят мастера со всей республики</AppText>
</View>

// ✅ ПРАВИЛЬНО (или вообще без подзаголовка, или ёмкий title):
<ScreenHeader title="Где находится задача" />
<BottomSheet title="Этот мастер выполнил работу?" />
<View>
  <AppText>Вся Ингушетия</AppText>
</View>
```

**Исключение** — Privacy/Terms-экраны с явной датой «Действует с 19 мая 2026», legal-disclaimer с обязательным юридическим текстом. Они **обязаны** иметь подзаголовок по требованию compliance.

**Перед коммитом**: grep `subtitle=` и `text-caption text-mute` под H1/H2 — каждое подозрительное место удалить или переписать в title.

### F. Stub'ы — запрещены в production-ready экранах

```tsx
// ❌ ЗАПРЕЩЕНО:
onPress={() => {}}                                    // пустой handler
onPress={() => Alert.alert("Скоро", "В разработке")}  // stub без entry в TASKS.md
```

Если нет времени реализовать — **не показывай** контрол вообще. Лучше отсутствие фичи, чем «потыкал и ничего».

## Что Vercel/Linear/Stripe делают и мы делаем

- **Жёсткая консистентность** — один и тот же spacing, radii, цвета **по всему продукту**
- **Plenty of whitespace** — лучше меньше элементов с воздухом, чем больше плотно
- **Strong typography** — display-большой, body-средний, mute-маленький; чёткая hierarchy
- **One primary action per screen** — пользователь всегда знает что делать
- **Monospace для цифр** — рейтинги, цены, расстояния, идентификаторы (xtrud override)
- **Минимум цветов** — primary/ink/canvas + 2-3 accent. Не радуга.

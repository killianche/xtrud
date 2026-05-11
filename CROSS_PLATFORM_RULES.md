# CROSS_PLATFORM_RULES.md

> Жёсткие правила вёрстки для Expo universal app (iOS + Android + Web из одной кодовой базы).
> Цель документа — чтобы дизайн выглядел **одинаково** и **читаемо** на всех трёх платформах.
> Аудитория: владелец проекта + AI-ассистент, генерирующий UI-код.
> Стек: Expo SDK 52+, Expo Router v4, NativeWind, TypeScript strict, Reanimated 3, Supabase.

---

## 0. Корневая причина «мелкого iOS» (и не только)

Когда вы пишете один и тот же CSS/Tailwind-код, который рендерится через `react-native-web` на вебе и через RN на нативе, вы упираетесь в фундаментальное расхождение единиц измерения.

- В **браузере** базовый размер шрифта = `16px` (HTML root). Tailwind-классы `text-base`, `text-lg` и т.д. в дефолтной web-конфигурации измеряются в `rem`, т.е. в долях от этих 16px. И браузер ещё применяет meta-viewport scale, zoom, font-boosting.
- В **React Native** нет ни `rem`, ни `em`, ни `vh`, ни `%` (для шрифтов и большинства размеров). Все числа — это **density-independent pixels (dp/pt)**. NativeWind конвертирует `text-base` → `fontSize: 16` напрямую в **dp**, без масштабирования.
- iOS Retina экраны имеют физическую плотность 2x-3x, но `1pt ≈ 1dp ≈ 1 CSS px на 100% zoom`. **На вебе** браузер на десктопе по умолчанию рендерит при 100% zoom, а meta-viewport на мобильном вебе по умолчанию даёт device-width. **На нативе** же ничего этого нет — 16dp это и есть 16dp.

Результат: если вы спроектировали макет «для веба» и думали в `px`, а потом запустили это в Expo Go на iPhone — кнопки и шрифты будут выглядеть мелкими, потому что iOS-нативный дизайн традиционно использует более крупный body text (17pt в HIG) и более крупные тач-таргеты (44pt минимум). Кроме того, на вебе у вас часто **нет meta-viewport** в Expo Web по умолчанию для адаптива, и динамическое масштабирование шрифтов iOS (Dynamic Type) либо включено, либо нет — поведение разное на каждой платформе.

**Решение** — спроектировать единую density-independent шкалу токенов в **dp**, отключить автоматический accessibility-scaling шрифтов через `maxFontSizeMultiplier`, проставить корректный meta-viewport на веб, и использовать платформенно-нейтральные примитивы (Pressable, Image из expo-image, FlashList) везде, где это возможно.

---

## 1. ЖЁСТКИЕ ПРАВИЛА (20 шт)

### Правило 1. Единицы измерения — только **dp** (целые числа). Запрещены `px`, `rem`, `em`, `vh`, `vw`, `%` для размеров и шрифтов.

**Почему**: RN не понимает `rem`/`em`/`vh`. NativeWind конвертирует Tailwind-классы в RN-стили, где число = dp. Если вы напишете `style={{ fontSize: '1rem' }}` — на нативе будет undefined behavior, на вебе будет 16px, на iOS — `NaN`. Проценты разрешены **только** для ширины/высоты внутри flex-контейнера (`w-1/2`, `h-full`).

```tsx
// ПРАВИЛЬНО
<Text className="text-base p-4">Привет</Text>           // fontSize:16, padding:16
<View className="w-full h-12 px-4" />                    // width:'100%', height:48

// НЕПРАВИЛЬНО
<Text style={{ fontSize: '1rem' }}>Привет</Text>         // ломается на iOS/Android
<View style={{ height: '50vh' }} />                      // vh не существует в RN
```

**Ломается**: iOS/Android (NaN, layout вообще не строится).

---

### Правило 2. Базовый шрифт body = **16 dp**, заголовки начинаются с **20 dp**.

**Почему**: iOS HIG рекомендует 17pt для body, Material Design — 16dp. Берём 16 как общий знаменатель, но **никогда** не используем меньше 14dp для основного текста и меньше 12dp для подписей. `text-xs` (12dp) — только лейблы, бейджи, мета-инфо. На мастеров 30-60 лет — `text-base` (16) — это минимум для интерактивного текста.

| Tailwind | dp | Использование |
|---|---|---|
| `text-xs` | 12 | мета, бейджи, не более 2 строк |
| `text-sm` | 14 | вторичный текст, label форм |
| `text-base` | 16 | **body по умолчанию** |
| `text-lg` | 18 | подзаголовки, важный body |
| `text-xl` | 20 | H4 |
| `text-2xl` | 24 | H3 |
| `text-3xl` | 30 | H2 |
| `text-4xl` | 36 | H1 экранов |

**Ломается**: iOS (всё выглядит мелким, как в браузере); пожилые пользователи на Android не могут прочитать.

---

### Правило 3. Всегда выставлять `maxFontSizeMultiplier={1.3}` на `<Text>` и инпутах.

**Почему**: iOS Dynamic Type и Android Font Scale могут увеличить шрифт в 2-3 раза и разломать вёрстку (особенно у пожилых, которые часто включают «крупный шрифт»). Полный запрет (`allowFontScaling={false}`) — антипаттерн с точки зрения accessibility. Ограничение до 1.3x — хороший компромисс: ваша вёрстка не ломается, юзер может чуть-чуть подкрутить.

```tsx
// Сделать обёртку <AppText> один раз и использовать везде
export function AppText(props: TextProps) {
  return <Text maxFontSizeMultiplier={1.3} {...props} />;
}
```

**Ломается**: iOS (Dynamic Type рвёт layout у юзера, у которого включён крупный шрифт в Настройках).

---

### Правило 4. Никаких `shadow-*` Tailwind-классов без явного `elevation` для Android.

**Почему**: `shadow-*` в NativeWind на iOS работает через `shadowColor/shadowOffset/shadowOpacity/shadowRadius`. На Android **эти свойства игнорируются** — нужен `elevation: N`. На вебе работает `box-shadow`. Если использовать «голый» Tailwind shadow — на Android тени просто не будет.

```tsx
// ПРАВИЛЬНО — NativeWind 4 поддерживает elevation
<View className="shadow-md elevation-md bg-white rounded-2xl" />
// Или через платформенный класс
<View className="ios:shadow-md android:elevation-4 web:shadow-md" />

// НЕПРАВИЛЬНО
<View className="shadow-md" />  // на Android тени нет
```

**Ломается**: Android (тени нет вообще).

---

### Правило 5. Border-radius + overflow: на Android всегда добавлять `overflow-hidden` если внутри картинка/градиент.

**Почему**: на Android `borderRadius` **не обрезает** дочерние элементы автоматически, как на iOS и в web. Картинка будет торчать из закруглённой карточки.

```tsx
<View className="rounded-2xl overflow-hidden">
  <Image source={...} className="w-full h-40" />
</View>
```

**Ломается**: Android (углы прямоугольные у вложенных изображений).

---

### Правило 6. Тач-таргеты — минимум **48 dp** по высоте/ширине (WCAG AAA + Material).

**Почему**: iOS HIG = 44pt, Material = 48dp, WCAG 2.5.5 AAA = 44×44. Берём 48 как общий минимум. Для мастеров 30-60 лет это критично. Если иконка визуально маленькая — используйте `hitSlop`.

```tsx
// ПРАВИЛЬНО
<Pressable className="h-12 min-w-12 px-4 items-center justify-center" />
<Pressable hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
  <Icon size={20} />
</Pressable>

// НЕПРАВИЛЬНО
<Pressable className="h-8 w-8"><Icon size={16} /></Pressable>  // 32dp — слишком мало
```

**Ломается**: все 3 платформы — UX, особенно у целевой аудитории.

---

### Правило 7. Hover/active/focus-классы — **только** для `web:`, на нативе не работают.

**Почему**: `hover:bg-gray-100` на iOS просто игнорируется. Но если вам нужен визуальный feedback на нажатие — используйте `active:` (он работает и на нативе через Pressable, и на вебе как `:active`) и/или `Pressable`'ный `pressed` state.

```tsx
// ПРАВИЛЬНО
<Pressable className="active:opacity-70 web:hover:bg-gray-50 active:bg-gray-100" />

// НЕПРАВИЛЬНО (нет feedback на нативе)
<Pressable className="hover:bg-gray-50" />
```

**Ломается**: iOS/Android (нет feedback на тач).

---

### Правило 8. Используйте `Pressable` **везде**, забудьте про `TouchableOpacity/Highlight/WithoutFeedback`.

**Почему**: `Pressable` — современный примитив, единственный, у которого предсказуемое поведение на 3 платформах + поддерживает `hitSlop`, `pressed` state, web-hover через `({ hovered })`. `TouchableOpacity` имеет баги на web и устарел.

```tsx
<Pressable
  className="h-12 px-4 rounded-xl bg-primary active:opacity-80"
  onPress={onSubmit}
>
  <Text className="text-white text-base font-medium">Отправить</Text>
</Pressable>
```

**Ломается**: web (Touchable* плохо рендерится в react-native-web).

---

### Правило 9. Safe area — `useSafeAreaInsets()` на нативе, `env(safe-area-inset-*)` на вебе.

**Почему**: iPhone с notch, Android с camera cutout, web на iOS Safari (с bottom-bar) — у всех разные «безопасные» зоны. На вебе нужно в `app.json` → `expo.web.meta` дописать `viewport-fit=cover` И в CSS подключать `env(safe-area-inset-bottom)`.

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const insets = useSafeAreaInsets();
<View style={{ paddingTop: insets.top, paddingBottom: insets.bottom }} />
// На вебе useSafeAreaInsets возвращает {0,0,0,0} — но это ок,
// потому что браузер сам справится через env(), если задать в CSS:
// padding-bottom: env(safe-area-inset-bottom);
```

И в `app.json`:
```json
"web": { "meta": { "viewportFit": "cover" } }
```

**Ломается**: iPhone (контент под notch/home indicator).

---

### Правило 10. На вебе обязательно прописать корректный `<meta name="viewport">`.

**Почему**: без `width=device-width, initial-scale=1, viewport-fit=cover` мобильный Safari отрендерит ваше Expo Web как desktop-страницу шириной 980px и уменьшит. Получится «мелко» — и это похоже на ту же боль, что и iOS native.

Expo Router пишет viewport автоматически в новых версиях, но проверьте сгенерированный `index.html` или `app/+html.tsx`:

```tsx
// app/+html.tsx
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
```

`maximum-scale=1` спорно для accessibility — оставьте его только если у вас идеально-адаптивный дизайн. Иначе уберите.

**Ломается**: web на мобильных браузерах.

---

### Правило 11. Шрифты — загружать через `expo-font` с явным `fontFamily`, **никогда** не полагаться на системные.

**Почему**: системный fallback — `San Francisco` на iOS, `Roboto` на Android, `Arial/Helvetica` на вебе. У них разная метрика — заголовок «выпрыгивает» по высоте, padding-сверху/снизу отличается. Лоадим **один и тот же** шрифт (например, Inter) на все 3 платформы.

```tsx
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';

const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_700Bold });
// Tailwind config: fontFamily.sans = ['Inter_400Regular']
```

В `tailwind.config.js`:
```js
fontFamily: { sans: ['Inter_400Regular'], medium: ['Inter_500Medium'], bold: ['Inter_700Bold'] }
```

**Ломается**: все 3 — но особенно заметно на iOS vs Android.

---

### Правило 12. Изображения — **только** `expo-image`, никогда RN `Image` или web `<img>`.

**Почему**: `expo-image` имеет единый API на 3 платформах, поддерживает кеш, blurhash, placeholder, content-fit. Стандартный `Image` из RN на вебе глючит с ratio и не кеширует. Атрибут `contentFit` соответствует CSS `object-fit`.

```tsx
import { Image } from 'expo-image';

<Image
  source={{ uri }}
  style={{ width: '100%', aspectRatio: 16/9 }}
  contentFit="cover"
  placeholder={blurhash}
  transition={200}
/>
```

**Ломается**: web (нет кеша, нет blurhash) + ratio-баги.

---

### Правило 13. Длинные списки — **FlashList** от Shopify, не `FlatList`, не `ScrollView`.

**Почему**: `FlatList` имеет плохую виртуализацию на Android и не виртуализируется на web. `FlashList` работает одинаково на 3 платформах, поддерживает sticky headers, и в 2-5 раз быстрее.

```tsx
import { FlashList } from '@shopify/flash-list';

<FlashList
  data={items}
  estimatedItemSize={88}     // ОБЯЗАТЕЛЬНО
  renderItem={({ item }) => <Card {...item} />}
/>
```

**Ломается**: Android/web (тормоза, memory leak на длинных списках).

---

### Правило 14. `KeyboardAvoidingView` — только нативу, на вебе не нужен.

**Почему**: на iOS клавиатура накрывает инпут — нужен `behavior="padding"`. На Android поведение настраивается через `android:windowSoftInputMode` в manifest, обычно `KeyboardAvoidingView` не нужен или нужен с `behavior="height"`. На вебе клавиатура не накрывает контент. Лучше всего — `react-native-keyboard-controller`, он работает универсально.

```tsx
import { KeyboardAvoidingView } from 'react-native';
import { Platform } from 'react-native';

<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  className="flex-1"
>
  {/* form */}
</KeyboardAvoidingView>
```

**Ломается**: iOS (клавиатура накрывает поле).

---

### Правило 15. Responsive — Tailwind-брейкпойнты + платформенный switch, **не** media queries в `style`.

**Почему**: NativeWind поддерживает `sm:`, `md:`, `lg:` и платформенные `web:`, `ios:`, `android:`. Используйте их вместо `Dimensions.get('window').width`. Для разных макетов «мобильный / планшет / десктоп» делайте через `lg:` префиксы.

```tsx
// ПРАВИЛЬНО
<View className="flex-col lg:flex-row gap-4 p-4 lg:p-8" />

// НЕПРАВИЛЬНО
const isDesktop = useWindowDimensions().width > 1024;
<View style={{ flexDirection: isDesktop ? 'row' : 'column' }} />
```

Брейкпойнты для нашего проекта: `sm:640 md:768 lg:1024 xl:1280`. Мобильный — всё, что меньше `md`. Веб-десктоп — от `lg`.

**Ломается**: web (desktop layout не подключается / не реагирует на resize).

---

### Правило 16. Платформенные файлы `.ios.tsx`/`.android.tsx`/`.web.tsx` — только когда поведение принципиально разное.

**Почему**: Metro/Webpack резолвит `Component.ios.tsx`, `Component.android.tsx`, `Component.web.tsx`, `Component.tsx` (fallback). **Не злоупотребляйте** — каждый такой split удваивает поддержку. Используйте только для:

- `Map.web.tsx` (Mapbox/Leaflet) vs `Map.native.tsx` (react-native-maps)
- `Pdf.web.tsx` (iframe) vs `Pdf.native.tsx` (react-native-pdf)
- Платёжный чекаут (Apple Pay / Google Pay / Stripe Web)

Для всего остального — `Platform.OS` внутри одного файла или `web:`/`ios:` Tailwind-префиксы.

**Ломается**: maintenance (3x кода).

---

### Правило 17. Тёмная тема — guard SSR. На вебе flash of wrong theme.

**Почему**: Expo Router static rendering генерирует HTML на сервере (build time), у него нет доступа к `useColorScheme` или localStorage юзера. При гидрации тема может «прыгнуть». Решение: рендерить начальный HTML без темы (нейтральные цвета), а тему применять через inline `<script>` в `<head>` ДО парсинга body — он читает localStorage и ставит `class="dark"` на `<html>`.

```tsx
// app/+html.tsx — inline script ДО body
<script dangerouslySetInnerHTML={{ __html: `
  (function(){
    var t = localStorage.getItem('theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  })();
`}} />
```

**Ломается**: web (FOUC — белый flash при загрузке тёмной темы).

---

### Правило 18. Анимации — **Reanimated 3** для всего, что сложнее `opacity`. CSS-transition на вебе не нужно.

**Почему**: Reanimated 3 работает на нативе через worklet (UI thread) и на вебе через CSS-анимации под капотом. У вас одна API. Не пишите ручные `Animated.Value` (старый API) — он медленнее и ведёт себя по-разному.

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const opacity = useSharedValue(0);
const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
// opacity.value = withTiming(1, { duration: 200 });
```

**Ломается**: Android (старый Animated.Value лагает), web (старый API не работает).

---

### Правило 19. Иконки — `lucide-react-native` с **явным** `size` в dp и `strokeWidth`.

**Почему**: SVG-иконки одинаково работают на 3 платформах. Но если не указать `size` — fallback размер разный (24 vs 16 vs браузерный default). Минимальный размер иконки в UI — **20 dp** (мельче — нечитаемо на 30-60 лет).

```tsx
import { Search } from 'lucide-react-native';

<Search size={20} strokeWidth={2} color="#111" />
```

Никаких иконочных шрифтов (FontAwesome через шрифт) — они в Expo Web глючат с кешем.

**Ломается**: web (шрифтовые иконки), все платформы (читаемость).

---

### Правило 20. SVG/PNG/Lottie — **react-native-svg** для иконок, PNG для фото, **lottie-react-native** для анимаций. Никаких GIF.

**Почему**: GIF на iOS не анимируется в `Image`, на вебе ок, на Android частично. Lottie работает на 3 платформах одинаково. SVG через `react-native-svg` (его использует lucide). PNG/JPEG/WebP через `expo-image`.

```tsx
import LottieView from 'lottie-react-native';
<LottieView source={require('./success.json')} autoPlay loop style={{ width: 120, height: 120 }} />
```

**Ломается**: iOS (GIF не двигается).

---

## 2. Базовый design-token файл

Сохрани как `/lib/tokens.ts`:

```ts
// /lib/tokens.ts
// Design tokens for Expo iOS + Android + Web universal app.
// ВСЕ значения — в density-independent pixels (dp). Web ≈ CSS px при 100% zoom.

export const spacing = {
  // 4dp grid — стандарт Material + iOS HIG. Никогда не используйте кратные не 4.
  px: 1,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,   // базовый padding контейнеров
  5: 20,
  6: 24,   // section gap
  8: 32,
  10: 40,
  12: 48,  // высота тач-таргета
  16: 64,
  20: 80,
  24: 96,
} as const;

export const typography = {
  // fontSize в dp; lineHeight — кратно 4. Соответствует Tailwind шкале.
  xs:   { fontSize: 12, lineHeight: 16 },  // мета, бейджи
  sm:   { fontSize: 14, lineHeight: 20 },  // label, secondary
  base: { fontSize: 16, lineHeight: 24 },  // body default — НЕ МЕНЬШЕ для body!
  lg:   { fontSize: 18, lineHeight: 28 },  // emphasised body
  xl:   { fontSize: 20, lineHeight: 28 },  // H4
  '2xl':{ fontSize: 24, lineHeight: 32 },  // H3
  '3xl':{ fontSize: 30, lineHeight: 36 },  // H2
  '4xl':{ fontSize: 36, lineHeight: 40 },  // H1
} as const;

export const fontWeight = {
  // именные веса — соответствуют именам Inter, лоадим только нужные.
  regular: '400',
  medium:  '500',
  semibold:'600',
  bold:    '700',
} as const;

export const radius = {
  // border-radius в dp. iOS любит крупные радиусы (16-20), Android — 8-12.
  // Берём средние значения — выглядит современно везде.
  none: 0,
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,   // карточки
  '2xl':24,   // bottom-sheet, модалки
  full: 9999,
} as const;

export const shadow = {
  // ВАЖНО: каждый shadow содержит и iOS-параметры, и Android elevation, и web boxShadow.
  // На NativeWind 4 elevation указывается отдельным классом, см. Правило 4.
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  lg: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
} as const;

export const touchTarget = {
  // Минимум тач-таргета для нашей ЦА (30-60 лет). Material 48dp = HIG 44pt + запас.
  min: 48,
  comfortable: 56,
} as const;

export const breakpoints = {
  // px на вебе. На нативе используем width < md? mobile : tablet (через useWindowDimensions).
  sm: 640,
  md: 768,   // mobile / tablet split
  lg: 1024,  // desktop split
  xl: 1280,
} as const;

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  modal: 50,
  toast: 100,
} as const;

export const animation = {
  // длительности (ms). Короче 150ms — выглядит дёрганно, длиннее 400 — медленно.
  fast: 150,
  normal: 220,
  slow: 320,
} as const;
```

И в `tailwind.config.js` подключите их же, чтобы Tailwind знал о шкале:

```js
// tailwind.config.js
const { spacing, typography, radius, breakpoints } = require('./lib/tokens.ts');

module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      spacing,
      borderRadius: radius,
      screens: { sm: `${breakpoints.sm}px`, md: `${breakpoints.md}px`, lg: `${breakpoints.lg}px`, xl: `${breakpoints.xl}px` },
    },
  },
};
```

---

## 3. Чек-лист «перед коммитом UI-компонента»

Прогон по 13 пунктам — компонент готов к мерджу:

- [ ] Запустил на iOS Simulator — текст читаем без zoom?
- [ ] Запустил на Android emulator — нет ли «зебры» от тени или прямых углов вместо закруглённых?
- [ ] Запустил в Chrome (desktop) и Chrome DevTools mobile (iPhone 12 preset) — layout не плывёт?
- [ ] Минимальная высота интерактивных элементов = 48dp (или используется `hitSlop`)?
- [ ] Шрифт нигде меньше 14dp; body = 16dp?
- [ ] У всех `<Text>` стоит `maxFontSizeMultiplier={1.3}` (через обёртку `<AppText>`)?
- [ ] Тени работают и на Android (есть `elevation`)?
- [ ] Картинки через `expo-image` с `contentFit` и явными `width/height` или `aspectRatio`?
- [ ] Длинные списки — через `FlashList` с `estimatedItemSize`?
- [ ] `Pressable` имеет `active:opacity-*` или другой press feedback?
- [ ] Safe area учтена (`useSafeAreaInsets` для `top/bottom` контейнеров)?
- [ ] Темная тема не «прыгает» при перезагрузке web-страницы (см. Правило 17)?
- [ ] Нет `px`/`rem`/`vh`/`hover:` без `web:`-префикса?

---

## 4. NativeWind vs Tamagui — вердикт

**Для этого проекта берите NativeWind 4.** Tamagui мощнее в плане compile-time-extracted styles и имеет лучшие готовые компоненты, но платит за это сложным конфигом (нужен babel-plugin, отдельный theme-builder), хуже работает с Expo Router static rendering, и порог входа выше — что плохо для соло-разработчика без сеньорной команды. NativeWind 4 + Tailwind-classes — почти zero-config, отлично интегрируется с Expo Router, и проблема «идентичность 3 платформ» там решается **дисциплиной правил из этого документа**, а не самой библиотекой. Главные грабли NativeWind: (1) `shadow-*` не даёт Android elevation — см. Правило 4; (2) hover-классы безмолвно игнорируются на нативе — Правило 7; (3) типы `className` иногда ругаются — нужен `cssInterop` для кастомных компонентов из сторонних либ.

---

## 5. Готовые компоненты/библиотеки, которые «просто работают» на 3 платформах

1. **`@shopify/flash-list`** — виртуализированные списки. Замена `FlatList`. Работает одинаково на 3 платформах.
2. **`expo-image`** — изображения с кешем, blurhash, transitions. Замена `Image` из RN и `<img>`.
3. **`react-native-keyboard-controller`** — клавиатура и keyboard avoiding. Лучше, чем `KeyboardAvoidingView`. На web — noop, не мешает.
4. **`react-native-gesture-handler`** — жесты swipe/pan/pinch. На вебе работает через pointer events.
5. **`react-native-reanimated`** v3 — анимации на UI thread, на web — через CSS под капотом.
6. **`react-native-safe-area-context`** — safe area insets. На web возвращает `{0,0,0,0}` — корректно, используйте `env()` в CSS.
7. **`@gorhom/bottom-sheet`** — bottom-sheet модалки. Работает на iOS/Android идеально, на web — fallback к обычной модалке (нужно проверить).
8. **`lucide-react-native`** — иконки SVG. Одинаково на 3 платформах, маленький bundle.
9. **`lottie-react-native`** — Lottie-анимации вместо GIF. Идентично на 3 платформах.
10. **`@tanstack/react-query`** — server state. Полностью платформо-нейтрален.
11. **`react-hook-form` + `zod`** — формы и валидация. Платформо-нейтральны.
12. **`@supabase/supabase-js` + `@supabase/ssr`** — Supabase клиент с поддержкой SSR (для Expo Router static rendering на web).

---

## TL;DR — что делать прямо сейчас

1. Создать `lib/tokens.ts` (см. раздел 2) и `tailwind.config.js` с этой шкалой.
2. Сделать обёртку `<AppText maxFontSizeMultiplier={1.3} />` и заменить все `<Text>` на неё.
3. Установить `expo-image`, `@shopify/flash-list`, `react-native-keyboard-controller`, `lucide-react-native`, `lottie-react-native`.
4. Прописать `viewport-fit=cover` в `app/+html.tsx`.
5. Запретить себе писать `px`, `rem`, `vh` и `hover:` без `web:`.
6. Использовать только `Pressable` (не `TouchableOpacity`).
7. Прогонять компонент по чек-листу из раздела 3 перед коммитом.

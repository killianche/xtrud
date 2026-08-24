/**
 * HowItWorks — секция «как это работает» на главной клиента.
 *
 * Layout 5 cards в 3 ряда (Profi.ру pattern):
 *   row 1: 2 cards 50/50 (Как это работает | Услуги в Ингушетии)
 *   row 2: 1 wide card 100% (Сколько стоит услуга + поясняющий текст)
 *   row 3: 2 cards 50/50 (Настоящие отзывы | Это бесплатно)
 *
 * Стиль карточек: `bg-canvas-soft`, rounded-xl, padding 5, иллюстрация в
 * правом-нижнем углу. Heading bold, body-sm mute (только в широкой карточке).
 *
 * **Иллюстрации — Iconify CDN, object-only** (фидбэк user 2026-05-18:
 * «в иллюстрациях не должны быть люди, только сами элементы»). Тот же
 * подход что используется для категорий (см. `getCategoryColorIconUrl`,
 * `docs/ICONS.md`):
 *   - `twemoji/handshake` — две руки (предметы, не персонажи)
 *   - `fluent-color/globe-24` — глобус
 *   - `fluent-color/coin-multiple-24` — монеты
 *   - `fluent-color/star-24` — звезда
 *   - `fluent-color/gift-24` — подарок
 *
 * Никаких SVG-импортов и Phosphor — `<Image source={{ uri: ... }} />`
 * через CDN, как делается на categories tab. Bundle не раздувается.
 */

import { Image, View } from "react-native";
import { AppText } from "@/components/AppText";

const ICONIFY_BASE = "https://api.iconify.design";

interface InfoCardProps {
  title: string;
  body?: string;
  iconUrl: string;
  iconSize?: number;
}

function InfoCard({ title, body, iconUrl, iconSize = 64 }: InfoCardProps) {
  return (
    <View
      className="flex-1 rounded-xl bg-canvas-soft p-5 overflow-hidden"
      style={{ minHeight: 168 }}
    >
      <AppText weight="semibold" className="text-title-md text-ink">
        {title}
      </AppText>
      {body ? (
        <AppText className="mt-2 text-body-sm text-mute" numberOfLines={5}>
          {body}
        </AppText>
      ) : null}
      <View className="mt-auto items-end pt-3">
        <Image
          source={{ uri: iconUrl }}
          style={{ width: iconSize, height: iconSize }}
          resizeMode="contain"
          accessible={false}
        />
      </View>
    </View>
  );
}

export function HowItWorks() {
  return (
    <View className="mt-10 px-5">
      {/* Row 1: 2 cards */}
      <View className="flex-row gap-3">
        <InfoCard
          title="Как это работает"
          iconUrl={`${ICONIFY_BASE}/twemoji/handshake.svg`}
          iconSize={64}
        />
        <InfoCard
          title="Услуги по всей Ингушетии"
          iconUrl={`${ICONIFY_BASE}/fluent-color:globe-24.svg`}
          iconSize={64}
        />
      </View>

      {/* Row 2: 1 wide card с body-текстом */}
      <View className="mt-3">
        <View
          className="rounded-xl bg-canvas-soft p-5 flex-row items-start gap-4 overflow-hidden"
          style={{ minHeight: 148 }}
        >
          <View className="flex-1">
            <AppText weight="semibold" className="text-title-md text-ink">
              Сколько стоит услуга
            </AppText>
            <AppText className="mt-2 text-body-sm text-mute">
              Укажите бюджет — мастера откликнутся со своими условиями. Или подождите предложений и
              выберите лучшее.
            </AppText>
          </View>
          <View className="items-end pt-1">
            <Image
              source={{ uri: `${ICONIFY_BASE}/fluent-color:coin-multiple-24.svg` }}
              style={{ width: 80, height: 80 }}
              resizeMode="contain"
              accessible={false}
            />
          </View>
        </View>
      </View>

      {/* Row 3: 2 cards */}
      <View className="mt-3 flex-row gap-3">
        <InfoCard
          title="Настоящие отзывы"
          iconUrl={`${ICONIFY_BASE}/fluent-color:star-24.svg`}
          iconSize={64}
        />
        <InfoCard
          title="Это бесплатно"
          iconUrl={`${ICONIFY_BASE}/fluent-color:gift-24.svg`}
          iconSize={64}
        />
      </View>
    </View>
  );
}

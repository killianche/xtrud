/**
 * /(tabs)/profile/settings — экран настроек.
 *
 * **Role-specific view (фидбэк user 2026-05-18 «отдельный вид настроек для
 * мастера и клиента»):**
 *
 * **Master view** (is_master=true):
 *   1. Профиль мастера — категории, прайс, портфолио, зоны работы,
 *      WhatsApp, приватность (скрыть профиль)
 *   2. Внешний вид — тема
 *   3. Аккаунт — телефон, выход
 *   4. Поддержка — Telegram
 *   5. О приложении — версия, условия, политика
 *
 * **Client view** (is_master=false):
 *   1. Внешний вид
 *   2. Аккаунт
 *   3. Поддержка
 *   4. О приложении
 *
 * Email НЕ показываем — auth.users.email синтетический (см. CLAUDE.md).
 * Скрытие профиля — за двумя тапами (settings → toggle), чтобы не сбросилось.
 */

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  CaretRight,
  Gear,
  Headset,
  Info,
  PaintBrush,
  ShieldCheck,
  SignOut,
  Trash,
} from "phosphor-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useBlockedUsers } from "@/features/blocking/use-user-blocks";
import { signOut } from "@/lib/auth";
import { confirmAsync } from "@/lib/confirm";
import { openExternalUrl } from "@/lib/open-link";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// Почту не публикуем — для связи с пользователями её не используем
// (правило проекта, см. CLAUDE.md). Поддержка — WhatsApp (владелец,
// 2026-09-11): телеграм-адреса @xtrud_support не существует.
const SUPPORT_WHATSAPP = "https://wa.me/79289204029";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const isMaster = user?.is_master === true;
  // Блокировка пользователей доступна всем авторизованным (не только
  // мастеру), поэтому раздел раскрыт с master-only на общий. blockedUsers
  // работает только при userId (см. useBlockedUsers) — до применения
  // миграции 0124 запрос падает и count просто не показывается.
  const blockedUsers = useBlockedUsers();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Настройки" onBack={goBack} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ Приватность и блокировки ============
            «Скрыть профиль» — master-only (поведенческий флажок, не
            редактирование данных). «Заблокированные пользователи» — для
            любой авторизованной роли (UGC safety, App Store Guideline 1.2). */}
        {userId ? (
          <Section icon={ShieldCheck} title="Приватность и блокировки">
            <ActionRow
              label="Заблокированные пользователи"
              count={blockedUsers.data?.length}
              chevron
              onPress={() => router.push("/profile/blocked-users" as never)}
            />
          </Section>
        ) : null}

        {/* ============ Внешний вид ============ */}
        <Section icon={PaintBrush} title="Внешний вид">
          <View className="px-5 py-3">
            <AppText className="text-body-sm text-mute mb-3">Тема приложения</AppText>
            <ThemeSwitcher />
          </View>
        </Section>

        {/* ============ Аккаунт ============ */}
        <Section icon={Gear} title="Аккаунт">
          {session?.user?.phone ? (
            <ReadOnlyRow label="Телефон" value={maskPhone(session.user.phone)} />
          ) : null}
          <ActionRow
            label="Выйти из аккаунта"
            destructive
            icon={SignOut}
            onPress={async () => {
              const confirmed = await confirmAsync({
                title: "Выйти из аккаунта?",
                message: "Чтобы вернуться, войдите заново по номеру или почте и паролю.",
                confirmText: "Выйти",
                cancelText: "Отмена",
              });
              if (!confirmed) return;
              await signOut();
              router.replace("/(auth)/phone" as never);
            }}
          />
          <ActionRow
            label="Удалить аккаунт"
            destructive
            icon={Trash}
            onPress={() =>
              router.push({
                pathname: "/profile/delete-account",
                params: { isMaster: isMaster ? "true" : "false" },
              } as never)
            }
          />
        </Section>

        {/* ============ Поддержка ============ */}
        <Section icon={Headset} title="Поддержка">
          <ActionRow
            label="Написать в Telegram"
            onPress={() => openExternalUrl(SUPPORT_WHATSAPP)}
          />
        </Section>

        {/* ============ О приложении ============ */}
        <Section icon={Info} title="О приложении">
          <ReadOnlyRow
            label="Версия"
            value={
              Constants.expoConfig?.version ??
              Constants.manifest2?.extra?.expoClient?.version ??
              "—"
            }
          />
          <ActionRow
            label="Условия использования"
            onPress={() => router.push("/legal/terms" as never)}
          />
          <ActionRow
            label="Политика конфиденциальности"
            onPress={() => router.push("/legal/privacy" as never)}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Section — секция настроек (icon-eyebrow + body, list-style).
// ============================================================================

interface SectionProps {
  icon: typeof Gear;
  title: string;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, children }: SectionProps) {
  const tc = useThemeColors(["mute"]);
  return (
    <View className="mt-6">
      <View className="px-5 pb-2 flex-row items-center gap-2">
        <Icon size={14} weight="bold" color={tc.mute} />
        <AppText weight="mono" className="text-mono-caption text-mute uppercase tracking-widest">
          {title}
        </AppText>
      </View>
      <View className="mx-5 rounded-xl border border-hairline bg-canvas overflow-hidden">
        {children}
      </View>
    </View>
  );
}

// ============================================================================
// ReadOnlyRow / ActionRow — list-rows внутри Section.
// ============================================================================

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="px-5 py-4 border-b border-hairline-soft flex-row items-center justify-between">
      <AppText className="text-body-md text-mute">{label}</AppText>
      <AppText weight="medium" className="text-body-md text-ink">
        {value}
      </AppText>
    </View>
  );
}

interface ActionRowProps {
  label: string;
  icon?: typeof Gear;
  destructive?: boolean;
  /** Счётчик справа от текста (напр. число заблокированных). Не рендерится
   *  при 0 или undefined — пустой счётчик не несёт информации. */
  count?: number;
  /** Показать шеврон справа — знак перехода на подэкран (не действие на месте). */
  chevron?: boolean;
  onPress: () => void;
}

function ActionRow({ label, icon: Icon, destructive, count, chevron, onPress }: ActionRowProps) {
  // Цвет текста — через className-токен (text-ink/text-error), НЕ inline style:
  // inline style={{color}} из useThemeColors не переключался корректно на тёмной
  // теме → текст был чёрным на тёмном фоне (фидбэк владельца 2026-05-29).
  const tc = useThemeColors(["ink", "error", "mute"]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="px-5 py-4 border-b border-hairline-soft flex-row items-center gap-3 active:bg-canvas-soft"
    >
      {Icon ? <Icon size={18} weight="bold" color={destructive ? tc.error : tc.ink} /> : null}
      <AppText
        weight="medium"
        className={`flex-1 text-body-md ${destructive ? "text-error" : "text-ink"}`}
      >
        {label}
      </AppText>
      {count ? (
        <AppText weight="mono" className="text-mono-caption text-mute">
          {count}
        </AppText>
      ) : null}
      {chevron ? <CaretRight size={16} weight="bold" color={tc.mute} /> : null}
    </Pressable>
  );
}

// ============================================================================
// utils
// ============================================================================

function maskPhone(phone: string): string {
  // Скрываем середину: показываем первые 2 + последние 2 цифры.
  // Поддерживаем оба формата: «+79000000003» (raw E.164) и «+7 (900) 000-00-03».
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return phone;
  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  const stars = "•".repeat(digits.length - 4);
  return `+${head} ${stars} ${tail}`;
}

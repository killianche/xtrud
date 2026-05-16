/**
 * /(tabs)/profile/settings — экран настроек.
 *
 * Секции (Vercel/Linear-style grouped list):
 *   1. Приватность — мастер: «Скрыть профиль от клиентов» (sprint 0078).
 *   2. Внешний вид — переключатель темы (Системная / Светлая / Тёмная).
 *   3. Аккаунт — телефон (read-only), «Выйти из аккаунта».
 *      Email НЕ показываем — мы его не используем как идентификатор пользователя
 *      (правило проекта, см. CLAUDE.md «Auth-политика»). auth.users.email живёт
 *      только из-за технического требования Supabase Auth (синтетический
 *      *@xtrud-demo.local), пользователю он не нужен.
 *   4. Поддержка — связаться с командой (Telegram).
 *   5. О приложении — версия, ссылки на условия и политику.
 *
 * Доступ — через ⚙ Gear в шапке /(tabs)/profile. Скрытие профиля — намеренно
 * за двумя тапами (settings → toggle), чтобы случайно не сбросилось.
 */

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  EyeSlash,
  Gear,
  Headset,
  Info,
  PaintBrush,
  ShieldCheck,
  SignOut,
} from "phosphor-react-native";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import {
  useMasterPrivacy,
  useUpdateMasterPrivacy,
} from "@/features/master-profile/use-master-privacy";
import { confirmAsync } from "@/lib/confirm";
import { signOut } from "@/lib/auth";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// Saller Email НЕ публикуем — мы принципиально не используем email
// для связи с пользователями (правило проекта, см. CLAUDE.md).
const SUPPORT_TELEGRAM = "https://t.me/xtrud_support";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const isMaster = user?.is_master === true;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Настройки" onBack={goBack} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ Приватность (master only) ============ */}
        {isMaster && userId ? (
          <Section icon={ShieldCheck} title="Приватность">
            <PrivacyToggleRow userId={userId} />
          </Section>
        ) : null}

        {/* ============ Внешний вид ============ */}
        <Section icon={PaintBrush} title="Внешний вид">
          <View className="px-5 py-3">
            <AppText className="text-body-sm text-mute mb-3">
              Тема приложения
            </AppText>
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
                message: "Чтобы вернуться, придётся войти заново через SMS.",
                confirmText: "Выйти",
                cancelText: "Отмена",
              });
              if (!confirmed) return;
              await signOut();
              router.replace("/(auth)/phone" as never);
            }}
          />
        </Section>

        {/* ============ Поддержка ============ */}
        <Section icon={Headset} title="Поддержка">
          <ActionRow
            label="Написать в Telegram"
            onPress={() =>
              Linking.openURL(SUPPORT_TELEGRAM).catch((e) =>
                Alert.alert("Не получилось открыть Telegram", String(e)),
              )
            }
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
            onPress={() => Alert.alert("Скоро", "Раздел в разработке.")}
          />
          <ActionRow
            label="Политика конфиденциальности"
            onPress={() => Alert.alert("Скоро", "Раздел в разработке.")}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// PrivacyToggleRow — toggle «Скрыть профиль от клиентов» для мастера.
// ============================================================================

function PrivacyToggleRow({ userId }: { userId: string }) {
  const { data, isLoading } = useMasterPrivacy(userId);
  const updatePrivacy = useUpdateMasterPrivacy();
  const tc = useThemeColors(["accent", "muted-soft"]);

  const value = data?.isHiddenFromSearch ?? false;
  const onToggle = (next: boolean) => {
    updatePrivacy.mutate({ userId, isHiddenFromSearch: next });
  };

  return (
    <View className="px-5 py-4 flex-row items-center gap-3">
      <View className="mt-0.5">
        <EyeSlash size={20} weight="bold" color={tc["muted-soft"]} />
      </View>
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink">
          Скрыть профиль от клиентов
        </AppText>
        <AppText className="mt-0.5 text-body-sm text-mute">
          Вы не появитесь в каталоге мастеров. Текущие чаты и заказы продолжат работать.
        </AppText>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={updatePrivacy.isPending}
          trackColor={{ true: tc.accent }}
        />
      )}
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
        <AppText
          weight="mono"
          className="text-mono-caption text-mute uppercase tracking-widest"
        >
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
  onPress: () => void;
}

function ActionRow({ label, icon: Icon, destructive, onPress }: ActionRowProps) {
  const tc = useThemeColors(["ink", "error"]);
  const color = destructive ? tc.error : tc.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="px-5 py-4 border-b border-hairline-soft flex-row items-center gap-3 active:bg-canvas-soft"
    >
      {Icon ? <Icon size={18} weight="bold" color={color} /> : null}
      <AppText
        weight="medium"
        className="flex-1 text-body-md"
        style={{ color }}
      >
        {label}
      </AppText>
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

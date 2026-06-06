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
  EyeSlash,
  Gear,
  Headset,
  Info,
  PaintBrush,
  ShieldCheck,
  SignOut,
  Trash,
} from "phosphor-react-native";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openExternalUrl } from "@/lib/open-link";
import { useState } from "react";
import { AppText } from "@/components/AppText";
import { BottomSheet, ScreenHeader } from "@/components/ui";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useDeleteMyAccount } from "@/features/auth/use-delete-account";
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
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);

  const isMaster = user?.is_master === true;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Настройки" onBack={goBack} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ============ Приватность (master only) ============
            Единственная master-only настройка в settings (всё остальное —
            на /profile через прямые shortcuts: категории, прайс, портфолио,
            edit-master). Шторка «Скрыть профиль» именно settings, не profile —
            это поведенческий флажок, не редактирование данных. */}
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
            onPress={() => setDeleteSheetOpen(true)}
          />
        </Section>

        {/* ============ Поддержка ============ */}
        <Section icon={Headset} title="Поддержка">
          <ActionRow
            label="Написать в Telegram"
            onPress={() => openExternalUrl(SUPPORT_TELEGRAM)}
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

      <DeleteAccountSheet
        open={deleteSheetOpen}
        isMaster={isMaster}
        onClose={() => setDeleteSheetOpen(false)}
        onDeleted={() => {
          setDeleteSheetOpen(false);
          router.replace("/(auth)/phone" as never);
        }}
      />
    </View>
  );
}

// ============================================================================
// DeleteAccountSheet — двухступенчатое подтверждение удаления.
// 1) Объяснение последствий + кнопка «Я понимаю».
// 2) Поле ввода слова «УДАЛИТЬ» + кнопка submit.
// Сделано как 2-step внутри одного sheet'а (не два отдельных alert'а),
// чтобы пользователь видел список последствий в момент подтверждения.
// ============================================================================

interface DeleteAccountSheetProps {
  open: boolean;
  isMaster: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteAccountSheet({ open, isMaster, onClose, onDeleted }: DeleteAccountSheetProps) {
  const [step, setStep] = useState<"warn" | "confirm">("warn");
  const [confirmText, setConfirmText] = useState("");
  const deleteAccount = useDeleteMyAccount();
  const tc = useThemeColors(["error", "muted-soft"]);

  const isBusy = deleteAccount.isPending;
  const REQUIRED = "УДАЛИТЬ";
  const canSubmit = step === "confirm" && confirmText.trim() === REQUIRED && !isBusy;

  // Сброс состояния при закрытии sheet'а.
  const handleClose = () => {
    if (isBusy) return;
    onClose();
    // setTimeout чтобы шаг не «дёрнулся» во время анимации закрытия.
    setTimeout(() => {
      setStep("warn");
      setConfirmText("");
    }, 250);
  };

  const handleDelete = async () => {
    if (!canSubmit) return;
    try {
      const result = await deleteAccount.mutateAsync();
      if (result.ok || result.reason === "already_deleted") {
        onDeleted();
      }
    } catch {
      // Ошибка покажется через deleteAccount.error ниже
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title={step === "warn" ? "Удалить аккаунт?" : "Подтвердите удаление"}
    >
      {step === "warn" ? (
        <View>
          <View className="rounded-lg border border-hairline bg-canvas-soft p-4">
            <ConsequenceRow text="Профиль скроется от других пользователей." />
            <ConsequenceRow text="Имя, телефон, фото и личные данные будут удалены." />
            <ConsequenceRow text="Открытые заявки будут отменены, мастера и клиенты получат уведомления." />
            {isMaster ? (
              <>
                <ConsequenceRow text="Категории, прайс-лист, портфолио и данные верификации будут удалены." />
                <ConsequenceRow text="Активные заказы, где вы выбраны мастером, будут отменены." />
              </>
            ) : null}
            <ConsequenceRow text="Чаты и отзывы останутся у второй стороны как «Удалённый пользователь»." />
            <ConsequenceRow text="Восстановить аккаунт через этот номер будет невозможно." />
          </View>

          <View className="mt-5 gap-3">
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep("confirm")}
              className="h-12 items-center justify-center rounded-md bg-error active:opacity-80"
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                Я понимаю, продолжить
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={handleClose}
              className="h-12 items-center justify-center rounded-md border border-hairline active:opacity-70"
            >
              <AppText weight="semibold" className="text-button text-ink">
                Отмена
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={REQUIRED}
            placeholderTextColor={tc["muted-soft"]}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            editable={!isBusy}
            maxFontSizeMultiplier={1.3}
            className="h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
            accessibilityLabel="Поле подтверждения удаления"
          />

          {deleteAccount.error ? (
            <AppText weight="medium" className="mt-3 text-caption text-error">
              {deleteAccount.error.message}
            </AppText>
          ) : null}

          <View className="mt-5 gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={handleDelete}
              className={`h-12 items-center justify-center rounded-md ${
                canSubmit ? "bg-error active:opacity-80" : "bg-surface-3"
              }`}
            >
              <AppText weight="semibold" className="text-button text-on-primary">
                {isBusy ? "Удаляем..." : "Удалить аккаунт"}
              </AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={handleClose}
              className="h-12 items-center justify-center rounded-md border border-hairline active:opacity-70"
            >
              <AppText weight="semibold" className="text-button text-ink">
                Отмена
              </AppText>
            </Pressable>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

function ConsequenceRow({ text }: { text: string }) {
  const tc = useThemeColors(["error"]);
  return (
    <View className="flex-row gap-2 py-1.5">
      <View className="mt-1.5 h-1 w-1 rounded-full" style={{ backgroundColor: tc.error }} />
      <AppText className="flex-1 text-body-sm text-body">{text}</AppText>
    </View>
  );
}

// ============================================================================
// PrivacyToggleRow — toggle «Скрыть профиль от клиентов» для мастера.
// ============================================================================

function PrivacyToggleRow({ userId }: { userId: string }) {
  const { data, isLoading } = useMasterPrivacy(userId);
  const updatePrivacy = useUpdateMasterPrivacy();
  const tc = useThemeColors(["accent", "muted-soft", "surface-3", "on-primary"]);

  const hidden = data?.isHiddenFromSearch ?? false;
  const onToggle = (next: boolean) => {
    updatePrivacy.mutate({ userId, isHiddenFromSearch: next });
  };

  return (
    <View className="px-5 py-4">
      <View className="flex-row items-center gap-3">
        <View className="mt-0.5">
          <EyeSlash size={20} weight="bold" color={tc["muted-soft"]} />
        </View>
        <View className="flex-1">
          <AppText weight="semibold" className="text-body-md text-ink">
            Скрыть профиль от клиентов
          </AppText>
          <AppText className="mt-0.5 text-body-sm text-mute">
            Скрытого мастера не видно в каталоге и поиске. Текущие заказы
            продолжают работать.
          </AppText>
        </View>
        {isLoading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Switch
            value={hidden}
            onValueChange={onToggle}
            disabled={updatePrivacy.isPending}
            trackColor={{ false: tc["surface-3"], true: tc.accent }}
            thumbColor={tc["on-primary"]}
            ios_backgroundColor={tc["surface-3"]}
          />
        )}
      </View>

      {/* Явный текущий статус — чтобы сразу было видно, скрыты вы или нет. */}
      {!isLoading ? (
        <View
          className={`mt-3 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 ${
            hidden ? "bg-warning-soft" : "bg-success-soft"
          }`}
        >
          <View
            className={`h-1.5 w-1.5 rounded-full ${hidden ? "bg-warning" : "bg-success"}`}
          />
          <AppText
            weight="medium"
            className={`text-caption ${hidden ? "text-warning-deep" : "text-success"}`}
          >
            {hidden ? "Сейчас скрыты — клиенты вас не видят" : "Сейчас видны в каталоге"}
          </AppText>
        </View>
      ) : null}
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
  // Цвет текста — через className-токен (text-ink/text-error), НЕ inline style:
  // inline style={{color}} из useThemeColors не переключался корректно на тёмной
  // теме → текст был чёрным на тёмном фоне (фидбэк владельца 2026-05-29).
  const tc = useThemeColors(["ink", "error"]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="px-5 py-4 border-b border-hairline-soft flex-row items-center gap-3 active:bg-canvas-soft"
    >
      {Icon ? (
        <Icon size={18} weight="bold" color={destructive ? tc.error : tc.ink} />
      ) : null}
      <AppText
        weight="medium"
        className={`flex-1 text-body-md ${destructive ? "text-error" : "text-ink"}`}
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

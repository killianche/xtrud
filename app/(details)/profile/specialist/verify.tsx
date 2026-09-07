/**
 * /profile/specialist/verify — подтверждение личности по паспорту.
 * DECISION владельца 2026-09-07: «человек отправляет фото паспорта, оно
 * приходит в админку, админ подтверждает — появляется значок».
 *
 * Состояния: не отправлено → «на проверке» → подтверждено | отклонено (с
 * причиной и возможностью отправить заново). Фото видит только администратор.
 */

import { useRouter } from "expo-router";
import { IdentificationCard, SealCheck } from "phosphor-react-native";
import { useState } from "react";
import { Alert, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen, InsetGroup, InsetRow } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useMyVerification,
  useSubmitVerification,
  VERIFICATION_LABEL,
} from "@/features/specialist/use-verification";
import { hapticSuccess } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export default function VerifyIdentityScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["accent", "ink", "mute", "success"]);
  const verification = useMyVerification(userId);
  const submit = useSubmitVerification(userId);
  const [error, setError] = useState<string | null>(null);

  const v = verification.data ?? null;
  const status = v?.status ?? "none";
  const canSend = status !== "approved" && !submit.isPending;

  const send = async () => {
    setError(null);
    try {
      const result = await submit.mutateAsync({ previous: v });
      if (result === "sent") {
        hapticSuccess();
        Alert.alert(
          "Фото отправлено",
          "Проверим в течение дня и пришлём уведомление. Фото видит только администратор.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить фото");
    }
  };

  const statusValue = (() => {
    if (!v) return VERIFICATION_LABEL.none;
    if (v.status === "pending")
      return `${VERIFICATION_LABEL.pending} · ${formatDate(v.submitted_at)}`;
    if (v.status === "approved") return VERIFICATION_LABEL.approved;
    return VERIFICATION_LABEL.rejected;
  })();

  return (
    <FormScreen
      title="Подтверждение личности"
      subtitle="По желанию. Профиль виден в каталоге и без этого; подтверждённым специалистам доверяют больше — в профиле появится значок."
      onBack={() => router.back()}
      primaryLabel={
        status === "approved"
          ? undefined
          : status === "pending"
            ? "Заменить фото"
            : status === "rejected"
              ? "Отправить новое фото"
              : "Сфотографировать паспорт"
      }
      onPrimary={canSend ? () => void send() : undefined}
      primaryDisabled={!canSend}
      busy={submit.isPending}
      error={error}
    >
      <InsetGroup
        title="Статус"
        footer={
          v?.status === "rejected" && v.rejection_reason
            ? `Причина: ${v.rejection_reason}`
            : v?.status === "pending"
              ? "Обычно проверяем в течение дня. Пришлём уведомление."
              : undefined
        }
      >
        <InsetRow
          title="Личность"
          value={statusValue}
          icon={
            status === "approved" ? (
              <SystemIcon
                sf="checkmark.seal.fill"
                fallback={SealCheck}
                size={20}
                weight="regular"
                color={tc.success}
              />
            ) : (
              <IdentificationCard size={18} weight="bold" color={tc.ink} />
            )
          }
          last
        />
      </InsetGroup>

      <InsetGroup title="Как это работает">
        <InsetRow
          title="Сфотографируйте главный разворот паспорта"
          subtitle="Фото должно быть чётким: имя, фамилия и фото читаются."
        />
        <InsetRow
          title="Фото видит только администратор"
          subtitle="Оно не показывается в приложении и не передаётся другим людям."
        />
        <InsetRow
          title="Значок в профиле"
          subtitle="После подтверждения рядом с именем появится знак проверенного специалиста."
          last
        />
      </InsetGroup>

      <View className="px-9">
        <AppText className="text-ios-footnote text-mute">
          Отправляя фото, вы соглашаетесь на обработку данных документа для подтверждения личности
          (Политика конфиденциальности).
        </AppText>
      </View>
    </FormScreen>
  );
}

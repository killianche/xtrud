/**
 * /admin/verifications — проверка паспортов в приложении (админ). Фото по
 * временной ссылке, «Подтвердить» / «Отклонить» с причиной. Права проверяет
 * база.
 *
 * Имя и фамилию админ вписывает с документа сам (0182): значок утверждает
 * именно их, поэтому подтвердить без имени нельзя, а человек это поле в
 * своём профиле не редактирует. Поля стоят рядом с фотографией — чтобы
 * сверять, не переключаясь между экранами.
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen, GlassButton, Input, InsetGroup } from "@/components/ui";
import {
  type AdminVerificationRow,
  useAdminReviewVerification,
  useAdminVerifications,
  useIsAdmin,
  verificationPhotoUrl,
} from "@/features/admin/use-admin-actions";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { hapticSuccess } from "@/lib/haptics";
import { promptAsync } from "@/lib/prompt";

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void verificationPhotoUrl(path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) {
    return <View className="h-52 w-full rounded-xl bg-canvas-soft-2" />;
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: "100%", height: 208, borderRadius: 12 }}
      resizeMode="contain"
      accessibilityLabel="Фото паспорта"
      accessibilityIgnoresInvertColors
    />
  );
}

/** Карточка заявки: фото документа и поля имени рядом с ним. */
function VerificationCard({
  row,
  busy,
  onApprove,
  onReject,
}: {
  row: AdminVerificationRow;
  busy: boolean;
  onApprove: (firstName: string, lastName: string) => void;
  onReject: () => void;
}) {
  // Подставляем то, что человек написал о себе сам, — обычно это правда и
  // админу останется поправить пару букв, а не набирать заново.
  const [first, setFirst] = useState(row.first_name ?? "");
  const [last, setLast] = useState(row.last_name ?? "");
  const ready = first.trim().length > 0 && last.trim().length > 0;

  return (
    <View className="mb-6 px-4">
      <View className="rounded-2xl bg-canvas p-4">
        <AppText className="text-ios-footnote text-mute">
          {row.phone ?? "Телефон не указан"} ·{" "}
          {new Date(row.submitted_at).toLocaleDateString("ru-RU")}
        </AppText>
        <View className="mt-3">
          <Photo path={row.passport_main_path} />
        </View>

        <AppText className="mt-4 text-ios-footnote text-mute">
          Впишите фамилию и имя так, как в документе. Они попадут в профиль и закрепятся за
          человеком.
        </AppText>
        <View className="mt-2 gap-2">
          <Input
            value={last}
            onChangeText={setLast}
            placeholder="Фамилия"
            accessibilityLabel="Фамилия по документу"
            autoCapitalize="words"
          />
          <Input
            value={first}
            onChangeText={setFirst}
            placeholder="Имя"
            accessibilityLabel="Имя по документу"
            autoCapitalize="words"
          />
        </View>

        <View className="mt-3 flex-row gap-2">
          <View className="flex-1">
            <GlassButton
              label="Подтвердить"
              onPress={() => onApprove(first.trim(), last.trim())}
              busy={busy}
              disabled={!ready}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отклонить"
            onPress={onReject}
            disabled={busy}
            className="min-h-14 items-center justify-center rounded-full border border-hairline bg-canvas px-5 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-ios-body text-error">
              Отклонить
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function AdminVerificationsScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const isAdmin = useIsAdmin(userId);
  const list = useAdminVerifications("pending", isAdmin);
  const review = useAdminReviewVerification();

  const decide = async (
    row: AdminVerificationRow,
    approve: boolean,
    firstName?: string,
    lastName?: string,
  ) => {
    let reason: string | undefined;
    if (!approve) {
      const answer = await promptAsync({
        title: "Причина отклонения",
        message: "Её увидит человек в уведомлении.",
        placeholder: "Фото нечёткое",
        confirmText: "Отклонить",
      });
      if (!answer) return;
      reason = answer;
    }
    review.mutate(
      { userId: row.user_id, approve, reason, firstName, lastName },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) => Alert.alert("Не получилось", e.message),
      },
    );
  };

  const rows = list.data ?? [];
  return (
    <FormScreen
      title="Паспорта"
      subtitle="Сверьте имя и фамилию в аккаунте с паспортом. Фото видно только вам."
      onBack={() => router.back()}
    >
      {!isAdmin ? (
        <InsetGroup footer="Раздел доступен только администратору.">
          <View className="h-1" />
        </InsetGroup>
      ) : list.isLoading ? (
        <InsetGroup footer="Загружаем…">
          <View className="h-1" />
        </InsetGroup>
      ) : rows.length === 0 ? (
        <InsetGroup footer="Заявок на проверку нет.">
          <View className="h-1" />
        </InsetGroup>
      ) : (
        rows.map((row) => (
          <VerificationCard
            key={row.user_id}
            row={row}
            busy={review.isPending}
            onApprove={(firstName, lastName) => void decide(row, true, firstName, lastName)}
            onReject={() => void decide(row, false)}
          />
        ))
      )}
    </FormScreen>
  );
}

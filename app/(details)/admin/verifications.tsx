/**
 * /admin/verifications — проверка паспортов в приложении (админ). Тот же
 * поток, что в веб-панели: фото по временной ссылке, «Подтвердить» /
 * «Отклонить» с причиной. Права проверяет база.
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen, GlassButton, InsetGroup } from "@/components/ui";
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

export default function AdminVerificationsScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const isAdmin = useIsAdmin(userId);
  const list = useAdminVerifications("pending", isAdmin);
  const review = useAdminReviewVerification();

  const decide = async (row: AdminVerificationRow, approve: boolean) => {
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
      { userId: row.user_id, approve, reason },
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
          <View key={row.user_id} className="mb-6 px-4">
            <View className="rounded-2xl bg-canvas p-4">
              <AppText weight="semibold" className="text-ios-body text-ink">
                {[row.first_name, row.last_name].filter(Boolean).join(" ") || "Без имени"}
              </AppText>
              <AppText className="mt-0.5 text-ios-footnote text-mute">
                {row.phone ?? "Телефон не указан"} ·{" "}
                {new Date(row.submitted_at).toLocaleDateString("ru-RU")}
              </AppText>
              <View className="mt-3">
                <Photo path={row.passport_main_path} />
              </View>
              <View className="mt-3 flex-row gap-2">
                <View className="flex-1">
                  <GlassButton
                    label="Подтвердить"
                    onPress={() => void decide(row, true)}
                    busy={review.isPending}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Отклонить"
                  onPress={() => void decide(row, false)}
                  disabled={review.isPending}
                  className="min-h-14 items-center justify-center rounded-full border border-hairline bg-canvas px-5 active:bg-canvas-soft"
                >
                  <AppText weight="semibold" className="text-ios-body text-error">
                    Отклонить
                  </AppText>
                </Pressable>
              </View>
            </View>
          </View>
        ))
      )}
    </FormScreen>
  );
}

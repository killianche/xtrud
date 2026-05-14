/**
 * Edit-client — экран редактирования базовой инфы клиента.
 *
 * Поля: имя, фамилия, город (BD `cities` id), район.
 * Master редактирует расширенный набор полей через edit-master.tsx.
 */

import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CITIES, type CityId } from "@/components/CitySelector";
import { Button, Input, PickerSheet, type PickerOption } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useUpdateMyProfile } from "@/features/profile/use-update-my-profile";
import { useThemeColors } from "@/lib/use-theme-color";

export default function EditClientScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const update = useUpdateMyProfile(userId);
  const tc = useThemeColors(["ink"]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [cityId, setCityId] = useState<CityId>("all");
  const [district, setDistrict] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [didInit, setDidInit] = useState(false);

  // Один раз префиллим форму актуальными значениями после загрузки user.
  // Дальнейшие правки пользователя не перетираем.
  useEffect(() => {
    if (!user || didInit) return;
    setFirstName(user.first_name ?? "");
    setLastName(user.last_name ?? "");
    setCityId(((user.city_id as CityId) ?? "all"));
    setDistrict(user.district ?? "");
    setDidInit(true);
  }, [user, didInit]);

  const cityOptions: PickerOption[] = CITIES.filter((c) => c.id !== "all").map((c) => ({
    id: c.id,
    title: c.name,
  }));
  const cityLabel = CITIES.find((c) => c.id === cityId)?.name ?? "Не выбрано";

  const canSave = firstName.trim().length >= 2 && !update.isPending;
  const isDirty =
    (firstName ?? "") !== (user?.first_name ?? "") ||
    (lastName ?? "") !== (user?.last_name ?? "") ||
    cityId !== ((user?.city_id as CityId) ?? "all") ||
    (district ?? "") !== (user?.district ?? "");

  const onSave = () => {
    update.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        city_id: cityId === "all" ? null : cityId,
        district,
      },
      {
        onSuccess: () => router.back(),
        onError: (e) => Alert.alert("Не удалось сохранить", e.message),
      },
    );
  };

  const onBack = () => {
    if (isDirty) {
      Alert.alert("Есть несохранённые изменения", "Выйти без сохранения?", [
        { text: "Остаться", style: "cancel" },
        { text: "Выйти", style: "destructive", onPress: () => router.back() },
      ]);
      return;
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={onBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={tc.ink} />
        </Pressable>
        <AppText weight="semibold" className="text-title-md text-ink">
          Редактирование
        </AppText>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 px-6 pt-4">
          <Input
            label="Имя"
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Алина"
            autoCapitalize="words"
            maxLength={50}
            hint={firstName.trim().length < 2 ? "Минимум 2 символа" : undefined}
          />
          <Input
            label="Фамилия"
            value={lastName}
            onChangeText={setLastName}
            placeholder="Тестова"
            autoCapitalize="words"
            maxLength={50}
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => setCityOpen(true)}
            className="active:opacity-70"
          >
            <AppText weight="medium" className="mb-2 text-caption text-mute">
              Город
            </AppText>
            <View className="h-12 flex-row items-center justify-between rounded-md border border-hairline bg-canvas px-3">
              <AppText className="text-body-md text-ink">{cityLabel}</AppText>
              <AppText className="text-caption text-mute">изменить</AppText>
            </View>
          </Pressable>

          <Input
            label="Район"
            value={district}
            onChangeText={setDistrict}
            placeholder="Центр"
            autoCapitalize="words"
            maxLength={80}
            hint="Опционально — поможем подобрать ближайших мастеров"
          />

          <View className="mt-4">
            <Button
              variant="primary"
              size="lg"
              onPress={onSave}
              disabled={!canSave || !isDirty}
              loading={update.isPending}
            >
              Сохранить
            </Button>
          </View>
        </View>
      </ScrollView>

      <PickerSheet
        open={cityOpen}
        title="Город"
        options={cityOptions}
        selectedId={cityId === "all" ? null : cityId}
        onSelect={(id) => {
          if (id) setCityId(id as CityId);
          setCityOpen(false);
        }}
        onClose={() => setCityOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

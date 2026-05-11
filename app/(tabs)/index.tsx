import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { signOut } from "@/lib/auth";

export default function HomeTab() {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center bg-canvas px-6"
      style={{ paddingTop: insets.top }}
    >
      <AppText weight="bold" className="text-display-md tracking-tight text-ink">
        xtrud
      </AppText>
      <AppText className="mt-3 text-body-md text-body">
        Auth работает. Это заглушка главной.
      </AppText>
      <AppText className="mt-1 text-caption text-muted-soft">Sprint 1.6 завершён.</AppText>

      <Pressable
        accessibilityRole="button"
        onPress={() => signOut()}
        className="mt-10 h-12 items-center justify-center rounded-md border border-hairline bg-canvas px-6 active:opacity-70"
      >
        <AppText weight="medium" className="text-button text-body">
          Выйти
        </AppText>
      </Pressable>
    </View>
  );
}

import { Stack } from "expo-router";
import { useThemeColor } from "@/lib/use-theme-color";

export default function ProfileStackLayout() {
  const canvas = useThemeColor("canvas");

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: canvas } }}>
      <Stack.Screen name="index" options={{ animation: "none" }} />
    </Stack>
  );
}

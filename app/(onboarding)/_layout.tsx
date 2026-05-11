import { Stack } from "expo-router";

export default function OnboardingLayout() {
  // Onboarding-флоу: нельзя вернуться назад через системный gesture.
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />;
}

import { Stack } from "expo-router";

export default function AuthLayout() {
  // Все auth-экраны без хедера: фон canvas, минималистично.
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}

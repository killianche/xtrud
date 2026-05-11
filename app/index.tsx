import { Text, View } from "react-native";

// Заглушка главной — заменяется в sprint 1.6 на protected route + (tabs).
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-neutral-950">
      <Text className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">xtrud</Text>
      <Text className="mt-2 text-base text-neutral-600 dark:text-neutral-400">
        Scaffold ok. Sprint 1.1 завершён.
      </Text>
    </View>
  );
}

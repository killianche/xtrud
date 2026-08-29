import { Plus } from "phosphor-react-native";
import { Pressable } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";

export function CreateTaskButton({ onPress }: { onPress: () => void }) {
  const onPrimary = useThemeColor("on-primary");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Создать задание"
      onPress={onPress}
      className="h-14 w-full flex-row items-center justify-center gap-2 rounded-md bg-primary px-5 text-on-primary active:opacity-80"
    >
      <Plus size={22} weight="bold" color={onPrimary} />
      <AppText weight="semibold" className="text-button-lg text-on-primary">
        Создать задание
      </AppText>
    </Pressable>
  );
}

/**
 * Выход из конструктора на любом шаге (DECISION владельца 2026-09-07: «нет
 * отмены выхода из создания задания»). Как в Почте: при непустом черновике —
 * системный лист «Сохранить черновик / Удалить черновик / Отмена».
 * В редактировании — просто закрыть (гвард правок спросит сам).
 */

import { useRouter } from "expo-router";
import { ActionSheetIOS, Platform } from "react-native";
import { chooseAsync } from "@/lib/alert";
import { useOrderDraftStore } from "@/lib/order-draft-store";
import { useComposer } from "./composer-store";

export function useComposerClose(): () => void {
  const router = useRouter();
  const composer = useComposer();

  const leave = () => {
    // Снять весь стек конструктора и вернуться туда, откуда пришли (вкладка).
    if (router.canDismiss()) router.dismissAll();
    else router.replace("/(tabs)/orders" as never);
  };

  return () => {
    if (!composer.hasContent || composer.mode.kind === "edit") {
      leave();
      return;
    }
    const discard = () => {
      useOrderDraftStore.getState().clearDraft();
      leave();
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Отмена", "Удалить черновик", "Сохранить черновик"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          title: "Черновик задания",
        },
        (i) => {
          if (i === 1) discard();
          if (i === 2) leave();
        },
      );
    } else {
      void chooseAsync<"discard" | "save">({
        title: "Черновик задания",
        options: [
          { id: "discard", text: "Удалить черновик", destructive: true },
          { id: "save", text: "Сохранить черновик" },
        ],
      }).then((choice) => {
        if (choice === "discard") discard();
        if (choice === "save") leave();
      });
    }
  };
}

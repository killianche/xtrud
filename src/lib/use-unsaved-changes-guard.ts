import { useNavigation, usePreventRemove } from "@react-navigation/native";
import { useCallback, useRef } from "react";
import { confirmAsync } from "./confirm";

interface UnsavedChangesGuardOptions {
  hasUnsavedChanges: boolean;
  isBusy: boolean;
  title?: string;
  message?: string;
}

/**
 * One removal policy for header Back/Cancel and the native iOS edge-swipe.
 * Saving can explicitly authorize the next removal; an in-flight mutation is
 * never interruptible. React Navigation's original action is replayed only
 * after an explicit discard confirmation, preserving the gesture destination.
 */
export function useUnsavedChangesGuard({
  hasUnsavedChanges,
  isBusy,
  title = "Есть несохранённые изменения",
  message = "Выйти без сохранения?",
}: UnsavedChangesGuardOptions) {
  const navigation = useNavigation();
  const confirmationOpen = useRef(false);
  const allowNextRemove = useRef(false);

  usePreventRemove(hasUnsavedChanges || isBusy, ({ data }) => {
    if (allowNextRemove.current) {
      allowNextRemove.current = false;
      navigation.dispatch(data.action);
      return;
    }
    if (isBusy || confirmationOpen.current) return;

    confirmationOpen.current = true;
    void confirmAsync({
      title,
      message,
      confirmText: "Выйти",
      cancelText: "Остаться",
      destructive: true,
    })
      .then((confirmed) => {
        if (confirmed) navigation.dispatch(data.action);
      })
      .finally(() => {
        confirmationOpen.current = false;
      });
  });

  return useCallback(() => {
    allowNextRemove.current = true;
  }, []);
}

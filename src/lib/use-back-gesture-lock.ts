import { useNavigation } from "expo-router";
import { useEffect } from "react";

/** Blocks only the interactive native gesture; programmatic success redirects still work. */
export function useBackGestureLock(locked: boolean): void {
  const navigation = useNavigation();
  const rootNavigation = useNavigation("/");

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !locked });
    rootNavigation.setOptions({ gestureEnabled: !locked });
    return () => {
      // A success redirect may unmount while still locked. Never leak the
      // disabled gesture option into the next root screen.
      navigation.setOptions({ gestureEnabled: true });
      rootNavigation.setOptions({ gestureEnabled: true });
    };
  }, [locked, navigation, rootNavigation]);
}

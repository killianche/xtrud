export interface NativeBackPolicyInput {
  /** Local navigation state belongs to the root Stack itself. */
  localIsRoot: boolean;
  /** The in-app pathname history contains a caller before the current screen. */
  hasTrackedCaller: boolean;
}

/**
 * Expo Router injects the root initial route underneath a cold deep link.
 * That synthetic route is not a user-visible caller and must not override the
 * screen's explicit fallback. Nested stacks still own their initial-route
 * fallback (for example, a cold verify link may return to the phone screen).
 */
export function mayPopLocalStack({
  localIsRoot,
  hasTrackedCaller,
}: NativeBackPolicyInput): boolean {
  return !localIsRoot || hasTrackedCaller;
}

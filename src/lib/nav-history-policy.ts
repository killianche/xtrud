/**
 * Pure policy for the fallback navigation history.
 *
 * React Navigation owns real Stack history. This small path history exists
 * only for routes that cross navigator boundaries (for example, a hidden
 * detail route opened from another tab) and for deterministic deep-link
 * fallbacks. It must mirror native pop gestures instead of recording them as
 * new forward navigation.
 */

export const MAX_NAV_HISTORY_ENTRIES = 50;

export function recordNavPath(stack: readonly string[], path: string): string[] {
  const top = stack[stack.length - 1];
  if (top === path) return [...stack];

  // A native iOS edge-swipe (or a real Stack goBack) changes the pathname to
  // the immediately previous entry. Reconcile that as a pop. Treating it as
  // a push would produce [A, B, A] and the next Back would reopen B.
  const previous = stack[stack.length - 2];
  if (previous === path) return stack.slice(0, -1);

  const next = [...stack, path];
  return next.length > MAX_NAV_HISTORY_ENTRIES
    ? next.slice(next.length - MAX_NAV_HISTORY_ENTRIES)
    : next;
}

export function popNavPath(stack: readonly string[]): {
  stack: string[];
  previous?: string;
} {
  if (stack.length < 2) return { stack: [...stack] };
  return {
    stack: stack.slice(0, -1),
    previous: stack[stack.length - 2],
  };
}

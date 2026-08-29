export interface OrderPublishFlightGate {
  tryEnter: () => boolean;
  leave: () => void;
  isActive: () => boolean;
}

/** Synchronous single-flight gate: it closes before the first network await. */
export function createOrderPublishFlightGate(): OrderPublishFlightGate {
  let active = false;
  return {
    tryEnter: () => {
      if (active) return false;
      active = true;
      return true;
    },
    leave: () => {
      active = false;
    },
    isActive: () => active,
  };
}

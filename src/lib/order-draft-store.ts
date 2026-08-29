/**
 * Owner-bound persisted draft for the order form.
 *
 * Form fields survive auth roundtrips and cold reloads for 14 days, but each
 * account gets an isolated owner-keyed snapshot. Guest data is claimed only by
 * an exact-user post-auth record; logout/account switch shows an empty or
 * matching snapshot, never another user's PII. Photo URIs are never persisted.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CreateOrderFormValues } from "@/features/orders/order-schema";
import {
  activateOrderDraftOwner,
  bindGuestDraftClaimToUser,
  consumeGuestDraftClaimRecord,
  createGuestDraftAuthJourney,
  createOrderDraftOwnerCoordinator,
  type GuestDraftAuthJourney,
  type GuestDraftClaimRecord,
  isOrderDraftExpired,
  type OrderDraft,
  type OrderDraftOwnerId,
  type OrderDraftPhoto,
  orderDraftOwnerKey,
  type PersistedOrderDraftSnapshot,
  type PersistedOrderDraftState,
  type PersistedOrderPhotoSlot,
  sanitizePersistedOrderDraftState,
  shouldPreserveOrderDraftProcessState,
  toPersistedPhotoSlots,
  withoutOrderDraftOwnerSnapshot,
} from "@/lib/order-draft-policy";
import { largeSecureStorage } from "@/lib/storage";

export type { OrderDraft, OrderDraftPhoto } from "@/lib/order-draft-policy";

interface OrderDraftState {
  draft: OrderDraft;
  setDraft: (patch: Partial<CreateOrderFormValues>) => void;
  clearDraft: () => void;
  clearDraftForOwner: (ownerId: OrderDraftOwnerId) => void;

  /** Full URIs are available only while the current JS process is alive. */
  photos: OrderDraftPhoto[];
  photoSlots: PersistedOrderPhotoSlot[];
  setPhotos: (photos: OrderDraftPhoto[]) => void;
  discardPhotoSlots: () => void;

  hasHydrated: boolean;
  setHasHydrated: (hasHydrated: boolean) => void;

  /** undefined means that Supabase session has not been resolved yet. */
  activeOwnerId: OrderDraftOwnerId | undefined;
  snapshots: Record<string, PersistedOrderDraftSnapshot>;
  activateOwner: (
    ownerId: OrderDraftOwnerId,
    options?: {
      claimGuest?: boolean;
      showGuest?: boolean;
      force?: boolean;
      claimedPhotos?: OrderDraftPhoto[];
    },
  ) => void;
  failClosedDraftRecovery: () => void;

  selectedL2: string | null;
  setSelectedL2: (id: string | null) => void;

  selectedLocation: { cityId: string; district: string } | null;
  setSelectedLocation: (loc: { cityId: string; district: string } | null) => void;
}

function withActiveSnapshot(
  state: Pick<OrderDraftState, "activeOwnerId" | "snapshots">,
  snapshot: PersistedOrderDraftSnapshot,
): Record<string, PersistedOrderDraftSnapshot> {
  if (state.activeOwnerId === undefined) return state.snapshots;
  return {
    ...state.snapshots,
    [orderDraftOwnerKey(state.activeOwnerId)]: snapshot,
  };
}

function withoutActiveSnapshot(
  state: Pick<OrderDraftState, "activeOwnerId" | "snapshots">,
): Record<string, PersistedOrderDraftSnapshot> {
  if (state.activeOwnerId === undefined) return state.snapshots;
  const snapshots = { ...state.snapshots };
  delete snapshots[orderDraftOwnerKey(state.activeOwnerId)];
  return snapshots;
}

/** Empty text/category drafts are not presented as meaningful drafts. */
export function hasDraftContent(draft: OrderDraft | null | undefined): boolean {
  if (!draft || isOrderDraftExpired(draft)) return false;
  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  const description = typeof draft.description === "string" ? draft.description.trim() : "";
  const l2 = typeof draft.l2Id === "string" ? draft.l2Id.trim() : "";
  return !!(title || description || l2);
}

export const useOrderDraftStore = create<OrderDraftState>()(
  persist(
    (set) => ({
      draft: {},
      setDraft: (patch) =>
        set((state) => {
          const draft = { ...state.draft, ...patch, updatedAt: Date.now() };
          return {
            draft,
            snapshots: withActiveSnapshot(state, {
              draft,
              photoSlots: state.photoSlots,
            }),
          };
        }),
      clearDraft: () =>
        set((state) => ({
          draft: {},
          photos: [],
          photoSlots: [],
          selectedL2: null,
          selectedLocation: null,
          snapshots: withoutActiveSnapshot(state),
        })),
      clearDraftForOwner: (ownerId) =>
        set((state) => {
          const snapshots = withoutOrderDraftOwnerSnapshot(state.snapshots, ownerId);
          if (state.activeOwnerId !== ownerId) return { snapshots };
          return {
            draft: {},
            photos: [],
            photoSlots: [],
            selectedL2: null,
            selectedLocation: null,
            snapshots,
          };
        }),

      photos: [],
      photoSlots: [],
      setPhotos: (photos) =>
        set((state) => {
          const draft = { ...state.draft, updatedAt: Date.now() };
          const photoSlots = toPersistedPhotoSlots(photos);
          return {
            photos,
            photoSlots,
            draft,
            snapshots: withActiveSnapshot(state, { draft, photoSlots }),
          };
        }),
      discardPhotoSlots: () =>
        set((state) => ({
          photos: [],
          photoSlots: [],
          snapshots: withActiveSnapshot(state, { draft: state.draft, photoSlots: [] }),
        })),

      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      activeOwnerId: undefined,
      snapshots: {},
      activateOwner: (ownerId, options = {}) =>
        set((state) => {
          if (
            !options.force &&
            shouldPreserveOrderDraftProcessState(state.activeOwnerId, ownerId)
          ) {
            return state;
          }
          const activated = activateOrderDraftOwner(
            { snapshots: state.snapshots },
            ownerId,
            Date.now(),
            options,
          );
          const preservePhotos = shouldPreserveOrderDraftProcessState(
            state.activeOwnerId,
            ownerId,
            activated.claimedGuest,
          );
          return {
            activeOwnerId: ownerId,
            draft: activated.snapshot.draft,
            photos: activated.claimedGuest
              ? (options.claimedPhotos ?? state.photos)
              : preservePhotos
                ? state.photos
                : [],
            photoSlots: activated.snapshot.photoSlots,
            selectedL2: null,
            selectedLocation: null,
            snapshots: activated.snapshots,
          };
        }),
      failClosedDraftRecovery: () =>
        set({
          draft: {},
          photos: [],
          photoSlots: [],
          snapshots: {},
          selectedL2: null,
          selectedLocation: null,
          hasHydrated: true,
        }),

      selectedL2: null,
      setSelectedL2: (id) => set({ selectedL2: id }),

      selectedLocation: null,
      setSelectedLocation: (loc) => set({ selectedLocation: loc }),
    }),
    {
      name: "xtrud:order-draft",
      version: 3,
      skipHydration: true,
      // Order descriptions can exceed one iOS Keychain item, so the chunked
      // adapter stores the snapshot without truncation.
      storage: createJSONStorage(() => largeSecureStorage),
      partialize: (state): PersistedOrderDraftState => ({ snapshots: state.snapshots }),
      // v2 did not bind PII to an owner. It cannot be safely assigned after an
      // upgrade, so legacy single snapshots fail closed instead of resurfacing.
      migrate: (persistedState) => ({
        snapshots: sanitizePersistedOrderDraftState(persistedState as PersistedOrderDraftState),
      }),
      merge: (persistedState, currentState) => {
        const persisted: PersistedOrderDraftState = {
          snapshots: sanitizePersistedOrderDraftState(
            persistedState as PersistedOrderDraftState | undefined,
          ),
        };
        if (currentState.activeOwnerId === undefined) {
          return {
            ...currentState,
            draft: {},
            photos: [],
            photoSlots: [],
            snapshots: persisted.snapshots ?? {},
          };
        }

        const activated = activateOrderDraftOwner(persisted, currentState.activeOwnerId);
        return {
          ...currentState,
          draft: activated.snapshot.draft,
          photos: [],
          photoSlots: activated.snapshot.photoSlots,
          snapshots: activated.snapshots,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          useOrderDraftStore.getState().failClosedDraftRecovery();
          return;
        }
        state?.setHasHydrated(true);
      },
    },
  ),
);

const GUEST_DRAFT_CLAIM_STORAGE_KEY = "xtrud:guest-draft-claim";

interface ProcessGuestDraftJourney extends GuestDraftAuthJourney {
  photos: OrderDraftPhoto[];
}

let guestDraftAuthJourney: ProcessGuestDraftJourney | null = null;
let guestJourneyCounter = 0;

export function beginGuestDraftAuthJourney(now = Date.now()): string | null {
  const state = useOrderDraftStore.getState();
  if (state.activeOwnerId !== null) return null;
  guestJourneyCounter += 1;
  const journeyId = `${now.toString(36)}-${guestJourneyCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
  const journey = createGuestDraftAuthJourney(
    journeyId,
    state.snapshots[orderDraftOwnerKey(null)],
    now,
  );
  guestDraftAuthJourney = journey ? { ...journey, photos: [...state.photos] } : null;
  return guestDraftAuthJourney ? journeyId : null;
}

async function readGuestDraftClaimRecord(): Promise<GuestDraftClaimRecord | null> {
  const value = await largeSecureStorage.getItem(GUEST_DRAFT_CLAIM_STORAGE_KEY);
  if (!value) return null;
  try {
    const record = JSON.parse(value) as Partial<GuestDraftClaimRecord>;
    if (
      record.version !== 1 ||
      typeof record.journeyId !== "string" ||
      typeof record.userId !== "string" ||
      typeof record.guestUpdatedAt !== "number" ||
      typeof record.expiresAt !== "number"
    ) {
      await largeSecureStorage.removeItem(GUEST_DRAFT_CLAIM_STORAGE_KEY);
      return null;
    }
    return record as GuestDraftClaimRecord;
  } catch {
    await largeSecureStorage.removeItem(GUEST_DRAFT_CLAIM_STORAGE_KEY);
    return null;
  }
}

export async function revokeGuestDraftAuthJourney(): Promise<void> {
  guestDraftAuthJourney = null;
  try {
    await largeSecureStorage.removeItem(GUEST_DRAFT_CLAIM_STORAGE_KEY);
  } catch {
    // Revocation is fail-closed in memory. Storage cleanup is best-effort and
    // must never create an unhandled rejection in navigation cleanup effects.
  }
}

export type GuestDraftAuthScreen = "phone" | "register";
export type GuestDraftAuthOrigin = "phone" | "sheet" | null;

export interface GuestDraftNavigationAction {
  type: string;
  targetRoute?: string;
}

function targetsAuthRoute(targetRoute: string | undefined, route: "phone" | "register"): boolean {
  return targetRoute === route || targetRoute?.endsWith(`/${route}`) === true;
}

/** Pure beforeRemove policy: success REPLACE is never treated as abandonment. */
export function shouldAbandonGuestDraftAuthJourney(
  screen: GuestDraftAuthScreen,
  action: GuestDraftNavigationAction,
  origin: GuestDraftAuthOrigin = null,
): boolean {
  if (action.type === "REPLACE") return false;

  if (action.type === "PUSH" || action.type === "NAVIGATE") {
    const isHandoff =
      (screen === "phone" && targetsAuthRoute(action.targetRoute, "register")) ||
      (screen === "register" && targetsAuthRoute(action.targetRoute, "phone"));
    return !isHandoff;
  }

  if (action.type === "GO_BACK" || action.type === "POP" || action.type === "POP_TO_TOP") {
    return screen === "phone" || origin !== "phone";
  }

  return true;
}

export function applyGuestDraftAuthAbandonment(
  shouldAbandon: boolean,
  actions: { clearReturnIntent: () => void; revokeJourney: () => void | Promise<void> },
): void {
  if (!shouldAbandon) return;
  actions.clearReturnIntent();
  void Promise.resolve(actions.revokeJourney()).catch(() => undefined);
}

const ownerCoordinator = createOrderDraftOwnerCoordinator({
  hydrate: () => useOrderDraftStore.persist.rehydrate(),
  isHydrated: () => useOrderDraftStore.persist.hasHydrated(),
  failClosed: () => useOrderDraftStore.getState().failClosedDraftRecovery(),
  activate: async (ownerId) => {
    const state = useOrderDraftStore.getState();
    if (ownerId === null) {
      await revokeGuestDraftAuthJourney();
      state.activateOwner(null);
      return;
    }
    const record = await readGuestDraftClaimRecord();
    const consumed = consumeGuestDraftClaimRecord(
      record,
      ownerId,
      state.snapshots[orderDraftOwnerKey(null)],
    );
    const processJourney = guestDraftAuthJourney;
    const claimedPhotos =
      consumed.authorized &&
      processJourney !== null &&
      record !== null &&
      processJourney.journeyId === record.journeyId &&
      record.userId === ownerId
        ? processJourney.photos
        : undefined;
    if (record) await largeSecureStorage.removeItem(GUEST_DRAFT_CLAIM_STORAGE_KEY);
    if (consumed.authorized) guestDraftAuthJourney = null;
    state.activateOwner(ownerId, {
      claimGuest: consumed.authorized,
      force: consumed.authorized,
      claimedPhotos,
    });
  },
});

export function activateOrderDraftOwnerForSession(ownerId: OrderDraftOwnerId): Promise<void> {
  return ownerCoordinator.activate(ownerId);
}

/** Called only after the auth mutation returns the exact authenticated user. */
export async function completeGuestDraftAuthJourney(
  journeyId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  // A cold restart has no process journey. Its already post-success record may
  // still be consumed by this exact user through the regular owner coordinator.
  if (!journeyId || !guestDraftAuthJourney) {
    guestDraftAuthJourney = null;
    await ownerCoordinator.activate(userId);
    return false;
  }
  const record = bindGuestDraftClaimToUser(guestDraftAuthJourney, journeyId, userId);
  if (!record) {
    await revokeGuestDraftAuthJourney();
    return false;
  }
  try {
    await largeSecureStorage.setItem(GUEST_DRAFT_CLAIM_STORAGE_KEY, JSON.stringify(record));
    await ownerCoordinator.activate(userId);
    return true;
  } catch {
    await revokeGuestDraftAuthJourney();
    return false;
  }
}

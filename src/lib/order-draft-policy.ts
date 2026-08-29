/**
 * Platform-free policy for private, owner-bound order drafts.
 *
 * A device can be shared by a guest and several signed-in accounts. Persisted
 * form fields therefore live in isolated owner snapshots. A guest snapshot is
 * claimed only by an exact-user, post-success, one-shot auth record; account
 * switches never expose another user's draft. Photo URIs remain process-memory only.
 */

import type { CreateOrderFormValues } from "@/features/orders/order-schema";

export const ORDER_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const ORDER_DRAFT_GUEST_KEY = "guest";
export const GUEST_DRAFT_AUTH_JOURNEY_TTL_MS = 15 * 60 * 1000;

export type OrderDraftOwnerId = string | null;

export type OrderDraft = Partial<CreateOrderFormValues> & {
  updatedAt?: number;
};

export interface OrderDraftPhoto {
  id: string;
  uri: string;
  width: number;
  height: number;
}

export interface PersistedOrderPhotoSlot {
  id: string;
  width: number;
  height: number;
}

export interface PersistedOrderDraftSnapshot {
  draft?: OrderDraft;
  photoSlots?: PersistedOrderPhotoSlot[];
}

export interface PersistedOrderDraftState {
  snapshots?: Record<string, PersistedOrderDraftSnapshot>;
}

export interface RestoredOrderDraftSnapshot {
  draft: OrderDraft;
  photoSlots: PersistedOrderPhotoSlot[];
  expired: boolean;
}

export interface ActivatedOrderDraftOwner {
  ownerKey: string;
  snapshot: RestoredOrderDraftSnapshot;
  snapshots: Record<string, PersistedOrderDraftSnapshot>;
  claimedGuest: boolean;
  discardedGuest: boolean;
}

export interface OrderDraftOwnerCoordinator {
  activate: (ownerId: OrderDraftOwnerId) => Promise<void>;
}

export interface GuestDraftAuthJourney {
  journeyId: string;
  guestUpdatedAt: number;
  createdAt: number;
}

export interface GuestDraftClaimRecord {
  version: 1;
  journeyId: string;
  userId: string;
  guestUpdatedAt: number;
  expiresAt: number;
}

function isPhotoSlot(value: unknown): value is PersistedOrderPhotoSlot {
  if (!value || typeof value !== "object") return false;
  const slot = value as Partial<PersistedOrderPhotoSlot>;
  return (
    typeof slot.id === "string" &&
    slot.id.length > 0 &&
    typeof slot.width === "number" &&
    Number.isFinite(slot.width) &&
    slot.width > 0 &&
    typeof slot.height === "number" &&
    Number.isFinite(slot.height) &&
    slot.height > 0
  );
}

function isSafeOwnerKey(value: string): boolean {
  return value === ORDER_DRAFT_GUEST_KEY || value.startsWith("user:");
}

export function orderDraftOwnerKey(ownerId: OrderDraftOwnerId): string {
  return ownerId === null ? ORDER_DRAFT_GUEST_KEY : `user:${ownerId}`;
}

/** Removes exactly one owner's persisted snapshot without touching another
 * account that may have become active while an async publish was in flight. */
export function withoutOrderDraftOwnerSnapshot(
  snapshots: Record<string, PersistedOrderDraftSnapshot>,
  ownerId: OrderDraftOwnerId,
): Record<string, PersistedOrderDraftSnapshot> {
  const next = { ...snapshots };
  delete next[orderDraftOwnerKey(ownerId)];
  return next;
}

export function isOrderDraftExpired(
  draft: OrderDraft | null | undefined,
  now = Date.now(),
): boolean {
  const updatedAt = draft?.updatedAt;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) return true;
  const age = now - updatedAt;
  return age < 0 || age >= ORDER_DRAFT_TTL_MS;
}

export function toPersistedPhotoSlots(photos: OrderDraftPhoto[]): PersistedOrderPhotoSlot[] {
  return photos.map(({ id, width, height }) => ({ id, width, height }));
}

export function restoreOrderDraftSnapshot(
  persisted: PersistedOrderDraftSnapshot | null | undefined,
  now = Date.now(),
): RestoredOrderDraftSnapshot {
  const draft = persisted?.draft;
  if (!draft || isOrderDraftExpired(draft, now)) {
    return { draft: {}, photoSlots: [], expired: !!draft };
  }

  const photoSlots = Array.isArray(persisted.photoSlots)
    ? persisted.photoSlots.filter(isPhotoSlot).slice(0, 5)
    : [];
  return { draft: { ...draft }, photoSlots, expired: false };
}

/** Drops malformed/expired entries without ever selecting an owner's PII. */
export function sanitizePersistedOrderDraftState(
  persisted: PersistedOrderDraftState | null | undefined,
  now = Date.now(),
): Record<string, PersistedOrderDraftSnapshot> {
  const snapshots: Record<string, PersistedOrderDraftSnapshot> = {};
  if (!persisted?.snapshots || typeof persisted.snapshots !== "object") return snapshots;

  for (const [ownerKey, candidate] of Object.entries(persisted.snapshots)) {
    if (!isSafeOwnerKey(ownerKey)) continue;
    const restored = restoreOrderDraftSnapshot(candidate, now);
    if (restored.expired) continue;
    snapshots[ownerKey] = {
      draft: restored.draft,
      photoSlots: restored.photoSlots,
    };
  }
  return snapshots;
}

/**
 * Selects only the requested owner's snapshot. Only an explicitly authorized
 * exact-user activation may consume the quarantined guest snapshot.
 */
export function activateOrderDraftOwner(
  persisted: PersistedOrderDraftState | null | undefined,
  ownerId: OrderDraftOwnerId,
  now = Date.now(),
  options: { claimGuest?: boolean; showGuest?: boolean } = {},
): ActivatedOrderDraftOwner {
  const snapshots = sanitizePersistedOrderDraftState(persisted, now);
  const ownerKey = orderDraftOwnerKey(ownerId);
  let claimedGuest = false;
  const discardedGuest = false;

  if (ownerId !== null && snapshots[ORDER_DRAFT_GUEST_KEY] && options.claimGuest) {
    if (!snapshots[ownerKey]) {
      snapshots[ownerKey] = snapshots[ORDER_DRAFT_GUEST_KEY];
      claimedGuest = true;
      delete snapshots[ORDER_DRAFT_GUEST_KEY];
    }
  }

  const selectedSnapshot = ownerId === null && !options.showGuest ? undefined : snapshots[ownerKey];
  const snapshot = restoreOrderDraftSnapshot(selectedSnapshot, now);
  return { ownerKey, snapshot, snapshots, claimedGuest, discardedGuest };
}

export function createGuestDraftAuthJourney(
  journeyId: string,
  guestSnapshot: PersistedOrderDraftSnapshot | undefined,
  now = Date.now(),
): GuestDraftAuthJourney | null {
  const updatedAt = guestSnapshot?.draft?.updatedAt;
  if (
    !journeyId ||
    typeof updatedAt !== "number" ||
    isOrderDraftExpired(guestSnapshot?.draft, now)
  ) {
    return null;
  }
  return { journeyId, guestUpdatedAt: updatedAt, createdAt: now };
}

/** A claim is minted only after auth succeeds and is bound to that exact user. */
export function bindGuestDraftClaimToUser(
  journey: GuestDraftAuthJourney | null,
  journeyId: string | null | undefined,
  userId: string,
  now = Date.now(),
): GuestDraftClaimRecord | null {
  if (
    !journey ||
    !userId ||
    journey.journeyId !== journeyId ||
    now - journey.createdAt < 0 ||
    now - journey.createdAt >= GUEST_DRAFT_AUTH_JOURNEY_TTL_MS
  ) {
    return null;
  }
  return {
    version: 1,
    journeyId: journey.journeyId,
    userId,
    guestUpdatedAt: journey.guestUpdatedAt,
    expiresAt: now + GUEST_DRAFT_AUTH_JOURNEY_TTL_MS,
  };
}

export function consumeGuestDraftClaimRecord(
  record: GuestDraftClaimRecord | null,
  userId: string,
  guestSnapshot: PersistedOrderDraftSnapshot | undefined,
  now = Date.now(),
): { authorized: boolean; nextRecord: null } {
  const active =
    record?.version === 1 &&
    record.userId === userId &&
    now < record.expiresAt &&
    guestSnapshot?.draft?.updatedAt === record.guestUpdatedAt &&
    !isOrderDraftExpired(guestSnapshot?.draft, now);
  return { authorized: active, nextRecord: null };
}

export function isOrderDraftUiReady(
  hasHydrated: boolean,
  activeOwnerId: OrderDraftOwnerId | undefined,
  appliedOwnerId: OrderDraftOwnerId | undefined,
): boolean {
  return hasHydrated && activeOwnerId !== undefined && appliedOwnerId === activeOwnerId;
}

export function consumeInitialRouteDraft(
  initialDraft: string,
  alreadyApplied: boolean,
): { value: string; nextApplied: true } {
  return { value: alreadyApplied ? "" : initialDraft, nextApplied: true };
}

/** A shortcut may seed only a genuinely empty draft. Mixing a new title with
 * old photos, location, deadline or budget would create a different order than
 * the one the owner sees in the shortcut. */
export function canApplyInitialTaskExample(
  draft: OrderDraft,
  attachmentCount: number,
  routeValue: string,
): boolean {
  if (routeValue.trim().length === 0 || attachmentCount > 0) return false;
  return Object.entries(draft).every(([key, value]) => {
    if (key === "updatedAt" || value === null || value === undefined || value === "") return true;
    return Array.isArray(value) && value.length === 0;
  });
}

/**
 * The caller first proves through canApplyInitialTaskExample that the whole
 * draft is empty. A gated route example then wins; otherwise restored text is
 * left untouched.
 */
export function resolveInitialOrderDraftText(
  restoredValue: string | null | undefined,
  routeValue: string,
  maxLength: number,
): string {
  if (routeValue.trim().length > 0) {
    return routeValue.slice(0, maxLength);
  }
  return restoredValue ?? "";
}

export function shouldPreserveOrderDraftProcessState(
  activeOwnerId: OrderDraftOwnerId | undefined,
  nextOwnerId: OrderDraftOwnerId,
  claimedGuest = false,
): boolean {
  return (
    activeOwnerId === nextOwnerId ||
    (activeOwnerId === null && nextOwnerId !== null && claimedGuest)
  );
}

/** Serializes hydration and owner changes so auth events cannot overtake storage. */
export function createOrderDraftOwnerCoordinator(input: {
  hydrate: () => void | Promise<void>;
  isHydrated: () => boolean;
  failClosed: () => void;
  activate: (ownerId: OrderDraftOwnerId) => void | Promise<void>;
}): OrderDraftOwnerCoordinator {
  let hydrationPromise: Promise<void> | null = null;
  let hydrationSettled = false;
  let transitionQueue = Promise.resolve();

  const ensureHydrated = async (): Promise<void> => {
    if (input.isHydrated() || hydrationSettled) return;
    if (!hydrationPromise) {
      hydrationPromise = Promise.resolve(input.hydrate())
        .catch(() => {
          input.failClosed();
        })
        .finally(() => {
          hydrationSettled = true;
        });
    }
    await hydrationPromise;
  };

  return {
    activate: (ownerId) => {
      const transition = transitionQueue.then(async () => {
        await ensureHydrated();
        await input.activate(ownerId);
      });
      transitionQueue = transition.catch(() => undefined);
      return transition;
    },
  };
}

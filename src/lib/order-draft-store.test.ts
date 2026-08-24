import { describe, expect, it } from "vitest";
import {
  activateOrderDraftOwner,
  bindGuestDraftClaimToUser,
  consumeGuestDraftClaimRecord,
  consumeInitialRouteDraft,
  createGuestDraftAuthJourney,
  createOrderDraftOwnerCoordinator,
  isOrderDraftExpired,
  isOrderDraftUiReady,
  ORDER_DRAFT_GUEST_KEY,
  ORDER_DRAFT_TTL_MS,
  orderDraftOwnerKey,
  restoreOrderDraftSnapshot,
  sanitizePersistedOrderDraftState,
  shouldPreserveOrderDraftProcessState,
  toPersistedPhotoSlots,
} from "./order-draft-policy";

describe("order draft persistence policy", () => {
  it("restores form fields inside the 14 day TTL", () => {
    const now = 2_000_000;
    const restored = restoreOrderDraftSnapshot(
      {
        draft: { title: "Починить крышу", updatedAt: now - ORDER_DRAFT_TTL_MS + 1 },
      },
      now,
    );

    expect(restored.draft.title).toBe("Починить крышу");
    expect(restored.expired).toBe(false);
  });

  it("clears expired drafts and drafts without a trustworthy timestamp", () => {
    const now = 2_000_000;
    expect(isOrderDraftExpired({ updatedAt: now - ORDER_DRAFT_TTL_MS }, now)).toBe(true);
    expect(restoreOrderDraftSnapshot({ draft: { title: "Старое" } }, now)).toEqual({
      draft: {},
      photoSlots: [],
      expired: true,
    });
  });

  it("persists photo slots without local URI or binary data", () => {
    const slots = toPersistedPhotoSlots([
      { id: "photo-1", uri: "blob:sensitive-preview", width: 1200, height: 900 },
    ]);

    expect(slots).toEqual([{ id: "photo-1", width: 1200, height: 900 }]);
    expect(JSON.stringify(slots)).not.toContain("blob:");
  });

  it("restores valid slots as re-selection placeholders and caps them at five", () => {
    const now = 2_000_000;
    const photoSlots = Array.from({ length: 7 }, (_, index) => ({
      id: `photo-${index}`,
      width: 800,
      height: 600,
    }));
    const restored = restoreOrderDraftSnapshot({ draft: { updatedAt: now - 1 }, photoSlots }, now);

    expect(restored.photoSlots).toHaveLength(5);
    expect(restored.photoSlots[0]?.id).toBe("photo-0");
  });

  it("never exposes user A draft after logout and user B login", () => {
    const now = 2_000_000;
    const state = {
      snapshots: {
        [orderDraftOwnerKey("user-a")]: {
          draft: { contactName: "Алиса", title: "Секрет A", updatedAt: now - 1 },
        },
        [orderDraftOwnerKey("user-b")]: {
          draft: { contactName: "Борис", title: "Черновик B", updatedAt: now - 1 },
        },
      },
    };

    const afterLogout = activateOrderDraftOwner(state, null, now);
    expect(afterLogout.snapshot.draft).toEqual({});

    const userB = activateOrderDraftOwner({ snapshots: afterLogout.snapshots }, "user-b", now);
    expect(userB.snapshot.draft.title).toBe("Черновик B");
    expect(JSON.stringify(userB.snapshot)).not.toContain("Секрет A");
    expect(userB.snapshots[orderDraftOwnerKey("user-a")]?.draft?.title).toBe("Секрет A");
  });

  it("keeps a cold-process guest snapshot quarantined and invisible", () => {
    const now = 2_000_000;
    const coldGuest = activateOrderDraftOwner(
      {
        snapshots: {
          [ORDER_DRAFT_GUEST_KEY]: {
            draft: { title: "Previous process PII", updatedAt: now - 1 },
          },
        },
      },
      null,
      now,
    );
    expect(coldGuest.snapshot.draft).toEqual({});
    expect(coldGuest.snapshots[ORDER_DRAFT_GUEST_KEY]?.draft?.title).toBe("Previous process PII");
  });

  it("claims a guest draft exactly once after successful login", () => {
    const now = 2_000_000;
    const guestState = {
      snapshots: {
        [ORDER_DRAFT_GUEST_KEY]: {
          draft: { description: "Гостевое описание", updatedAt: now - 1 },
        },
      },
    };

    const userA = activateOrderDraftOwner(guestState, "user-a", now, { claimGuest: true });
    expect(userA.claimedGuest).toBe(true);
    expect(userA.snapshot.draft.description).toBe("Гостевое описание");
    expect(userA.snapshots[ORDER_DRAFT_GUEST_KEY]).toBeUndefined();
    expect(userA.snapshots[orderDraftOwnerKey("user-a")]?.draft?.description).toBe(
      "Гостевое описание",
    );

    const userB = activateOrderDraftOwner({ snapshots: userA.snapshots }, "user-b", now);
    expect(userB.claimedGuest).toBe(false);
    expect(userB.snapshot.draft).toEqual({});
  });

  it("keeps an existing user draft and quarantines a competing guest draft", () => {
    const now = 2_000_000;
    const activated = activateOrderDraftOwner(
      {
        snapshots: {
          [ORDER_DRAFT_GUEST_KEY]: {
            draft: { title: "Чужой гостевой черновик", updatedAt: now - 1 },
          },
          [orderDraftOwnerKey("user-a")]: {
            draft: { title: "Собственный черновик", updatedAt: now - 1 },
          },
        },
      },
      "user-a",
      now,
      { claimGuest: true },
    );

    expect(activated.claimedGuest).toBe(false);
    expect(activated.discardedGuest).toBe(false);
    expect(activated.snapshot.draft.title).toBe("Собственный черновик");
    expect(activated.snapshots[ORDER_DRAFT_GUEST_KEY]?.draft?.title).toBe(
      "Чужой гостевой черновик",
    );
  });

  it("never auto-claims a guest draft on normal or cold-process login", () => {
    const now = 2_000_000;
    const state = {
      snapshots: {
        [ORDER_DRAFT_GUEST_KEY]: {
          draft: { title: "Guest PII", updatedAt: now - 1 },
        },
      },
    };
    const normalLogin = activateOrderDraftOwner(state, "user-a", now);
    expect(normalLogin.snapshot.draft).toEqual({});
    expect(normalLogin.snapshots[ORDER_DRAFT_GUEST_KEY]?.draft?.title).toBe("Guest PII");
  });

  it("does not create a claim before successful auth and abandon leaves no capability", () => {
    const now = 2_000_000;
    const guest = { draft: { title: "Journey draft", updatedAt: now - 1 } };
    const journey = createGuestDraftAuthJourney("journey-1", guest, now);

    expect(journey).toEqual({ journeyId: "journey-1", guestUpdatedAt: now - 1, createdAt: now });
    expect(consumeGuestDraftClaimRecord(null, "user-a", guest, now + 1).authorized).toBe(false);
    expect(bindGuestDraftClaimToUser(null, "journey-1", "user-a", now + 1)).toBeNull();
  });

  it("binds post-success claim to one exact user and consumes it once", () => {
    const now = 2_000_000;
    const guest = { draft: { title: "Journey draft", updatedAt: now - 1 } };
    const journey = createGuestDraftAuthJourney("journey-1", guest, now);
    const record = bindGuestDraftClaimToUser(journey, "journey-1", "user-a", now + 1);

    expect(consumeGuestDraftClaimRecord(record, "user-b", guest, now + 2).authorized).toBe(false);
    expect(consumeGuestDraftClaimRecord(record, "user-a", guest, now + 2)).toEqual({
      authorized: true,
      nextRecord: null,
    });
    expect(consumeGuestDraftClaimRecord(null, "user-a", guest, now + 3).authorized).toBe(false);
    expect(
      consumeGuestDraftClaimRecord(
        record,
        "user-a",
        {
          draft: { ...guest.draft, updatedAt: now + 5 },
        },
        now + 6,
      ).authorized,
    ).toBe(false);
  });

  it("allows a persisted same-user claim after a cold restart", () => {
    const now = 2_000_000;
    const guest = { draft: { description: "Cold journey", updatedAt: now - 1 } };
    const journey = createGuestDraftAuthJourney("journey-cold", guest, now);
    const persisted = bindGuestDraftClaimToUser(journey, "journey-cold", "user-a", now + 1);

    // Process journey is deliberately absent here; the secure record is enough
    // for fields, while local photo URIs remain unavailable after a restart.
    expect(consumeGuestDraftClaimRecord(persisted, "user-a", guest, now + 2).authorized).toBe(true);
  });

  it("keeps the same process journey across phone/register handoff", () => {
    const now = 2_000_000;
    const guest = { draft: { title: "Handoff", updatedAt: now - 1 } };
    const journey = createGuestDraftAuthJourney("journey-handoff", guest, now);

    expect(
      bindGuestDraftClaimToUser(journey, "journey-handoff", "user-a", now + 1)?.journeyId,
    ).toBe("journey-handoff");
  });

  it("keeps an unarmed journey bindable after a credential failure and retry", () => {
    const now = 2_000_000;
    const guest = { draft: { title: "Retry", updatedAt: now - 1 } };
    const journeyAfterFailure = createGuestDraftAuthJourney("journey-retry", guest, now);

    // A failed mutation creates no claim and does not mutate the process-only
    // journey; a later successful retry can bind it to the exact returned user.
    expect(
      bindGuestDraftClaimToUser(journeyAfterFailure, "journey-retry", "user-a", now + 1)?.userId,
    ).toBe("user-a");
  });

  it("supports auth-event-before-success by allowing a forced same-owner claim", () => {
    const now = 2_000_000;
    const guestState = {
      snapshots: {
        [ORDER_DRAFT_GUEST_KEY]: { draft: { title: "Event race", updatedAt: now - 1 } },
      },
    };
    const eventActivation = activateOrderDraftOwner(guestState, "user-a", now);
    expect(eventActivation.snapshot.draft).toEqual({});

    const journey = createGuestDraftAuthJourney(
      "journey-race",
      guestState.snapshots[ORDER_DRAFT_GUEST_KEY],
      now,
    );
    const record = bindGuestDraftClaimToUser(journey, "journey-race", "user-a", now + 1);
    const consumed = consumeGuestDraftClaimRecord(
      record,
      "user-a",
      eventActivation.snapshots[ORDER_DRAFT_GUEST_KEY],
      now + 2,
    );
    const explicitActivation = activateOrderDraftOwner(
      { snapshots: eventActivation.snapshots },
      "user-a",
      now + 2,
      { claimGuest: consumed.authorized },
    );
    expect(explicitActivation.snapshot.draft.title).toBe("Event race");
  });

  it("waits for hydration when auth resolves first and handles hydration-first", async () => {
    let releaseHydration: (() => void) | undefined;
    let hydrated = false;
    let hydratedTitle = "";
    const activations: string[] = [];
    const hydration = new Promise<void>((resolve) => {
      releaseHydration = () => {
        hydrated = true;
        hydratedTitle = "Persisted snapshot";
        resolve();
      };
    });
    const coordinator = createOrderDraftOwnerCoordinator({
      hydrate: () => hydration,
      isHydrated: () => hydrated,
      failClosed: () => {
        hydratedTitle = "";
      },
      activate: (ownerId) => {
        activations.push(`${ownerId ?? ORDER_DRAFT_GUEST_KEY}:${hydratedTitle}`);
      },
    });

    const authFirst = coordinator.activate("user-a");
    await Promise.resolve();
    expect(activations).toEqual([]);
    releaseHydration?.();
    await authFirst;
    expect(activations).toEqual(["user-a:Persisted snapshot"]);

    await coordinator.activate("user-b");
    expect(activations).toEqual(["user-a:Persisted snapshot", "user-b:Persisted snapshot"]);
  });

  it("continues owner activation fail-closed when hydration rejects", async () => {
    let cleared = false;
    const activated: string[] = [];
    const coordinator = createOrderDraftOwnerCoordinator({
      hydrate: async () => {
        throw new Error("storage unavailable");
      },
      isHydrated: () => false,
      failClosed: () => {
        cleared = true;
      },
      activate: (ownerId) => {
        activated.push(ownerId ?? ORDER_DRAFT_GUEST_KEY);
      },
    });

    await expect(coordinator.activate("user-a")).resolves.toBeUndefined();
    expect(cleared).toBe(true);
    expect(activated).toEqual(["user-a"]);
  });

  it("applies a route draft only to the first resolved owner", () => {
    const first = consumeInitialRouteDraft("Нужен тракторист", false);
    const afterOwnerSwitch = consumeInitialRouteDraft("Нужен тракторист", first.nextApplied);
    expect(first.value).toBe("Нужен тракторист");
    expect(afterOwnerSwitch.value).toBe("");
  });

  it("keeps form controls unavailable until hydration and owner snapshot application", () => {
    expect(isOrderDraftUiReady(false, undefined, undefined)).toBe(false);
    expect(isOrderDraftUiReady(true, "user-a", undefined)).toBe(false);
    expect(isOrderDraftUiReady(true, "user-b", "user-a")).toBe(false);
    expect(isOrderDraftUiReady(true, null, null)).toBe(true);
    expect(isOrderDraftUiReady(true, "user-a", "user-a")).toBe(true);
  });

  it("preserves process-only photos only for the same owner", () => {
    expect(shouldPreserveOrderDraftProcessState("user-a", "user-a")).toBe(true);
    expect(shouldPreserveOrderDraftProcessState("user-a", "user-b")).toBe(false);
    expect(shouldPreserveOrderDraftProcessState("user-a", null)).toBe(false);
    expect(shouldPreserveOrderDraftProcessState(null, "user-a", true)).toBe(true);
    expect(shouldPreserveOrderDraftProcessState(null, "user-a", false)).toBe(false);
  });

  it("drops stale snapshots for every owner and rejects ownerless v2 shape", () => {
    const now = 2_000_000;
    const staleState = {
      snapshots: {
        [ORDER_DRAFT_GUEST_KEY]: {
          draft: { title: "Старое", updatedAt: now - ORDER_DRAFT_TTL_MS },
        },
        [orderDraftOwnerKey("user-a")]: {
          draft: { title: "Из будущего", updatedAt: now + 1 },
        },
      },
    };

    expect(sanitizePersistedOrderDraftState(staleState, now)).toEqual({});
    expect(
      sanitizePersistedOrderDraftState(
        { draft: { title: "Legacy PII", updatedAt: now - 1 } } as never,
        now,
      ),
    ).toEqual({});
  });
});

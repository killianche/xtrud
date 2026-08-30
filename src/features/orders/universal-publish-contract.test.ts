import { describe, expect, it } from "vitest";
import {
  toUniversalOrderInsert,
  UNIVERSAL_FALLBACK_L2_ID,
  universalPublishErrorCode,
  universalPublishPayloadSchema,
} from "./universal-publish-contract";

const basePayload = {
  budgetKind: "fixed" as const,
  budgetValue: 12_000,
  cityId: "magas",
  clientPublishId: "550e8400-e29b-41d4-a716-446655440000",
  contactName: "Адам",
  description: "Нужно выполнить работу аккуратно и в согласованный срок.",
  district: null,
  locationScope: "city" as const,
  photoUrls: ["https://example.test/order/photo.webp"],
  preferredDate: "2026-09-10",
  title: "Нужен специалист на задачу",
  urgency: "by_date" as const,
  workMode: "onsite" as const,
};

describe("universalPublishPayloadSchema", () => {
  it("accepts an exact classified service and maps additive DB fields", () => {
    const payload = universalPublishPayloadSchema.parse({
      ...basePayload,
      classificationNote: null,
      classificationSource: "user_category",
      classificationStatus: "classified",
      l2Id: "heavy-equipment",
      l3Ids: ["bulldozer"],
      primaryL3Id: "bulldozer",
      requestedServiceText: null,
    });

    expect(toUniversalOrderInsert(payload)).toMatchObject({
      classification_note: null,
      classification_status: "classified",
      l2_id: "heavy-equipment",
      l3_ids: ["bulldozer"],
      location_scope: "city",
      moderation_status: "published",
      photo_urls: basePayload.photoUrls,
      primary_l3_id: "bulldozer",
      publish_idempotency_key: basePayload.clientPublishId,
      requested_service_text: null,
      work_mode: "onsite",
    });
  });

  it("never forwards a client-supplied service classification note", () => {
    const payload = universalPublishPayloadSchema.parse({
      ...basePayload,
      classificationNote: "Подменить служебную классификацию",
      classificationSource: "user_category",
      classificationStatus: "classified",
      l2Id: "legal",
      l3Ids: [],
      primaryL3Id: null,
      requestedServiceText: null,
    });

    expect(payload).not.toHaveProperty("classificationNote");
    expect(toUniversalOrderInsert(payload).classification_note).toBeNull();
  });

  it("preserves uploaded photo URLs and normalizes a blank description to null", () => {
    const payload = universalPublishPayloadSchema.parse({
      ...basePayload,
      classificationNote: null,
      classificationSource: "user_category",
      classificationStatus: "classified",
      description: "   ",
      l2Id: "legal",
      l3Ids: [],
      primaryL3Id: null,
      requestedServiceText: null,
    });

    expect(toUniversalOrderInsert(payload)).toMatchObject({
      description: null,
      photo_urls: ["https://example.test/order/photo.webp"],
    });
  });

  it("accepts an L2-only classification without L3", () => {
    const result = universalPublishPayloadSchema.safeParse({
      ...basePayload,
      classificationNote: null,
      classificationSource: "user_category",
      classificationStatus: "classified",
      l2Id: "legal",
      l3Ids: [],
      primaryL3Id: null,
      requestedServiceText: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts free-form fallback only with an empty exact classification", () => {
    expect(
      universalPublishPayloadSchema.safeParse({
        ...basePayload,
        classificationNote: null,
        classificationSource: "fallback",
        classificationStatus: "pending",
        l2Id: UNIVERSAL_FALLBACK_L2_ID,
        l3Ids: [],
        primaryL3Id: null,
        requestedServiceText: "Нужен специалист по редкой услуге",
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate L3 and a primary L3 outside the selected set", () => {
    const result = universalPublishPayloadSchema.safeParse({
      ...basePayload,
      classificationNote: null,
      classificationSource: "user_category",
      classificationStatus: "classified",
      l2Id: "legal",
      l3Ids: ["contracts", "contracts"],
      primaryL3Id: "legal-consult",
      requestedServiceText: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects inconsistent date and price combinations", () => {
    const result = universalPublishPayloadSchema.safeParse({
      ...basePayload,
      budgetKind: "negotiable",
      classificationNote: null,
      classificationSource: "user_category",
      classificationStatus: "classified",
      l2Id: "legal",
      l3Ids: ["legal-consult"],
      preferredDate: null,
      primaryL3Id: "legal-consult",
      requestedServiceText: null,
    });
    expect(result.success).toBe(false);
  });

  it("requires null location for remote work", () => {
    const remotePayload = {
      ...basePayload,
      classificationNote: null,
      classificationSource: "user_category",
      classificationStatus: "classified",
      l2Id: "legal",
      l3Ids: [],
      primaryL3Id: null,
      requestedServiceText: null,
      workMode: "remote",
      locationScope: "remote",
    };

    expect(universalPublishPayloadSchema.safeParse(remotePayload).success).toBe(false);
    expect(
      universalPublishPayloadSchema.safeParse({
        ...remotePayload,
        cityId: null,
        district: null,
      }).success,
    ).toBe(true);
  });

  it("enforces the exact region/city/district/remote location matrix", () => {
    const classified = {
      ...basePayload,
      classificationSource: "user_category" as const,
      classificationStatus: "classified" as const,
      l2Id: "legal",
      l3Ids: [],
      primaryL3Id: null,
      requestedServiceText: null,
    };
    expect(
      universalPublishPayloadSchema.safeParse({
        ...classified,
        cityId: null,
        district: null,
        locationScope: "region_wide",
      }).success,
    ).toBe(true);
    expect(
      universalPublishPayloadSchema.safeParse({
        ...classified,
        cityId: null,
        district: "Назрановский",
        locationScope: "district",
      }).success,
    ).toBe(true);
    expect(
      universalPublishPayloadSchema.safeParse({
        ...classified,
        cityId: "magas",
        district: null,
        locationScope: "district",
      }).success,
    ).toBe(false);
  });
});

describe("universalPublishErrorCode", () => {
  it("maps stable database errors without exposing SQL details", () => {
    expect(universalPublishErrorCode({ message: "order_l3_not_in_l2" })).toBe("L3_NOT_IN_L2");
    expect(universalPublishErrorCode({ message: "order_requested_service_text_immutable" })).toBe(
      "REQUESTED_SERVICE_TEXT_IMMUTABLE",
    );
    expect(universalPublishErrorCode({ code: "23505" })).toBe("DUPLICATE_PUBLISH");
    expect(universalPublishErrorCode({ message: "orders_work_mode_location_check" })).toBe(
      "INVALID_PAYLOAD",
    );
    expect(universalPublishErrorCode(new Error("unrelated"))).toBe("UNKNOWN");
  });
});

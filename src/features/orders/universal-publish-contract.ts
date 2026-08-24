/**
 * Shared, UI-agnostic contract for the universal order publisher.
 *
 * The existing `orders` row remains the only task entity. This module makes
 * the new classification/idempotency fields explicit without importing
 * Supabase generated types, so it can be used by web, native and fixtures while
 * the production schema snapshot/type regeneration remains gated.
 */

import { z } from "zod";

export const UNIVERSAL_FALLBACK_L1_ID = "xtrud-internal" as const;
export const UNIVERSAL_FALLBACK_L2_ID = "other-services" as const;
export const UNIVERSAL_FALLBACK_L3_ID = "other-service" as const;

export const UNIVERSAL_PUBLISH_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "NOT_AUTHORIZED",
  "INVALID_PAYLOAD",
  "CATEGORY_NOT_FOUND",
  "CATEGORY_TASK_CREATION_DISABLED",
  "L3_NOT_IN_L2",
  "PRIMARY_L3_NOT_SELECTED",
  "FALLBACK_REQUIRES_REVIEW",
  "REQUESTED_SERVICE_TEXT_IMMUTABLE",
  "DUPLICATE_PUBLISH",
  "CONTENT_REQUIRES_REVIEW",
  "CONTENT_REJECTED",
  "BLOCKED_RELATION",
  "UNKNOWN",
] as const;

export type UniversalPublishErrorCode = (typeof UNIVERSAL_PUBLISH_ERROR_CODES)[number];

const categoryIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Некорректный идентификатор категории");

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата должна быть в формате YYYY-MM-DD");

const exactClassificationSchema = z
  .object({
    classificationStatus: z.literal("classified"),
    classificationSource: z.enum(["user_category", "search_suggestion"]),
    l2Id: categoryIdSchema.refine((value) => value !== UNIVERSAL_FALLBACK_L2_ID),
    l3Ids: z.array(categoryIdSchema).max(10),
    primaryL3Id: categoryIdSchema.nullable(),
    requestedServiceText: z.string().trim().min(2).max(500).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (new Set(value.l3Ids).size !== value.l3Ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Конкретные услуги не должны повторяться",
        path: ["l3Ids"],
      });
    }
    if (value.primaryL3Id !== null && !value.l3Ids.includes(value.primaryL3Id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Основная услуга должна входить в выбранные услуги",
        path: ["primaryL3Id"],
      });
    }
  });

const fallbackClassificationSchema = z.object({
  classificationStatus: z.literal("pending"),
  classificationSource: z.literal("fallback"),
  l2Id: z.literal(UNIVERSAL_FALLBACK_L2_ID),
  l3Ids: z.tuple([]),
  primaryL3Id: z.null(),
  requestedServiceText: z.string().trim().min(2).max(500),
});

const universalOrderContentSchema = z
  .object({
    clientPublishId: z.string().uuid(),
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().max(2000).nullable(),
    photoUrls: z.array(z.string().url()).max(5).default([]),
    cityId: z.string().min(1).max(100).nullable(),
    district: z.string().trim().max(60).nullable(),
    workMode: z.enum(["onsite", "remote"]),
    locationScope: z.enum(["region_wide", "city", "district", "remote"]),
    contactName: z.string().trim().max(80).nullable(),
    urgency: z.enum(["urgent", "this_week", "this_month", "flexible", "by_date"]),
    preferredDate: isoDateSchema.nullable(),
    budgetKind: z.enum(["fixed", "from", "up_to", "negotiable"]),
    budgetValue: z.number().int().min(0).max(2_147_483_647).nullable(),
  })
  .superRefine((value, context) => {
    if (value.workMode === "remote" && value.locationScope !== "remote") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Удалённая услуга требует remote scope",
        path: ["locationScope"],
      });
    }
    if (value.workMode === "onsite" && value.locationScope === "remote") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Очная услуга не может иметь remote scope",
        path: ["locationScope"],
      });
    }
    const locationMatchesScope =
      (value.locationScope === "remote" && value.cityId === null && value.district === null) ||
      (value.locationScope === "region_wide" &&
        value.workMode === "onsite" &&
        value.cityId === null &&
        value.district === null) ||
      (value.locationScope === "city" &&
        value.workMode === "onsite" &&
        value.cityId !== null &&
        value.district === null) ||
      (value.locationScope === "district" &&
        value.workMode === "onsite" &&
        value.cityId === null &&
        !!value.district);
    if (!locationMatchesScope) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Локация не соответствует выбранному scope",
        path: ["locationScope"],
      });
    }
    if (value.urgency === "by_date" && value.preferredDate === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Для срока «К дате» нужна точная дата",
        path: ["preferredDate"],
      });
    }
    if (value.urgency !== "by_date" && value.preferredDate !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Точная дата допустима только для срока «К дате»",
        path: ["preferredDate"],
      });
    }
    const expectsBudgetValue = value.budgetKind !== "negotiable";
    if (expectsBudgetValue !== (value.budgetValue !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: expectsBudgetValue
          ? "Для выбранного типа бюджета нужна сумма"
          : "Для договорного бюджета сумма не указывается",
        path: ["budgetValue"],
      });
    }
  });

export const universalPublishPayloadSchema = z.intersection(
  universalOrderContentSchema,
  z.union([exactClassificationSchema, fallbackClassificationSchema]),
);

export type UniversalPublishPayload = z.infer<typeof universalPublishPayloadSchema>;

export interface UniversalOrderInsertContract {
  budget_kind: UniversalPublishPayload["budgetKind"];
  budget_value: number | null;
  city_id: string | null;
  classification_note: null;
  classification_source: "user_category" | "search_suggestion" | "fallback";
  classification_status: "classified" | "pending";
  contact_name: string | null;
  description: string | null;
  district: string | null;
  l2_id: string;
  l3_ids: string[];
  location_scope: UniversalPublishPayload["locationScope"];
  moderation_status: "published";
  photo_urls: string[];
  preferred_date: string | null;
  primary_l3_id: string | null;
  publish_idempotency_key: string;
  requested_service_text: string | null;
  title: string;
  urgency: UniversalPublishPayload["urgency"];
  work_mode: UniversalPublishPayload["workMode"];
}

export function toUniversalOrderInsert(
  payload: UniversalPublishPayload,
): UniversalOrderInsertContract {
  return {
    budget_kind: payload.budgetKind,
    budget_value: payload.budgetValue,
    city_id: payload.cityId,
    classification_note: null,
    classification_source: payload.classificationSource,
    classification_status: payload.classificationStatus,
    contact_name: payload.contactName,
    description: payload.description && payload.description.length > 0 ? payload.description : null,
    district: payload.district,
    l2_id: payload.l2Id,
    l3_ids: [...payload.l3Ids],
    location_scope: payload.locationScope,
    moderation_status: "published",
    photo_urls: [...payload.photoUrls],
    preferred_date: payload.preferredDate,
    primary_l3_id: payload.primaryL3Id,
    publish_idempotency_key: payload.clientPublishId,
    requested_service_text: payload.requestedServiceText,
    title: payload.title,
    urgency: payload.urgency,
    work_mode: payload.workMode,
  };
}

const databaseErrorCodeMap: Readonly<Record<string, UniversalPublishErrorCode>> = {
  "23505": "DUPLICATE_PUBLISH",
  "28000": "NOT_AUTHENTICATED",
  "42501": "NOT_AUTHORIZED",
  order_category_task_creation_disabled: "CATEGORY_TASK_CREATION_DISABLED",
  order_fallback_requires_review: "FALLBACK_REQUIRES_REVIEW",
  order_fallback_source_requires_fallback_l2: "FALLBACK_REQUIRES_REVIEW",
  order_l3_not_in_l2: "L3_NOT_IN_L2",
  order_primary_l3_not_in_l2: "L3_NOT_IN_L2",
  order_primary_l3_not_selected: "PRIMARY_L3_NOT_SELECTED",
  order_response_l2_mismatch: "L3_NOT_IN_L2",
  order_requested_service_text_immutable: "REQUESTED_SERVICE_TEXT_IMMUTABLE",
  orders_work_mode_location_check: "INVALID_PAYLOAD",
};

export function universalPublishErrorCode(error: unknown): UniversalPublishErrorCode {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.message === "string") {
    for (const [databaseCode, publicCode] of Object.entries(databaseErrorCodeMap)) {
      if (candidate.message.includes(databaseCode)) return publicCode;
    }
  }
  if (typeof candidate.code === "string" && candidate.code in databaseErrorCodeMap) {
    return databaseErrorCodeMap[candidate.code] ?? "UNKNOWN";
  }
  return "UNKNOWN";
}

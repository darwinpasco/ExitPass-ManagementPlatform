import type { CentralPmsApiClient } from "./types";

export const statutoryBenefitReviewRoute = "/management-platform/statutory-benefit-requests";
export const statutoryBenefitReviewContractVersion = "management-platform-statutory-benefit-review:v1";

export const statutoryBenefitReviewPermissions = {
  list: "statutory-discounts.review.queue.read",
  detail: "statutory-discounts.review.detail.read",
  evidence: "statutory-discounts.evidence.review.view",
  approve: "statutory-discounts.decision.approve",
  reject: "statutory-discounts.decision.reject"
} as const;

export type ReviewStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

export interface StatutoryBenefitReviewQueueItem {
  requestReference: string;
  decisionCommandReference: string;
  parkingSessionReference: string;
  ticketReference?: string;
  siteReference: string;
  siteCode: string;
  siteName: string;
  sourceChannel: "WEBPAY" | "ASSISTED_PAYMENT_TERMINAL";
  benefitType: "SENIOR_CITIZEN" | "PWD";
  status: ReviewStatus;
  evidenceRequired: boolean;
  evidenceRecorded: boolean;
  submittedAt: string;
  reviewerDisplayName?: string;
  decidedAt?: string;
}

export interface StatutoryBenefitReviewQueue {
  contractVersion: typeof statutoryBenefitReviewContractVersion;
  items: StatutoryBenefitReviewQueueItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  correlationId: string;
}

export interface StatutoryBenefitReviewDetail extends StatutoryBenefitReviewQueueItem {
  idDocumentType?: string;
  issuingAuthority?: string;
  expiryDate?: string;
  maskedIdReference?: string;
  requesterAttestation: boolean;
  submissionReason?: string;
  money?: { originalAmountMinorUnits: number; discountAmountMinorUnits: number; finalPayableAmountMinorUnits: number; currency: "PHP" };
  decision?: { decision: "APPROVE" | "REJECT"; reason?: string; reviewerDisplayName: string; decidedAt: string };
  version: number;
}

export interface StatutoryBenefitEvidence {
  contractVersion: typeof statutoryBenefitReviewContractVersion;
  decisionCommandReference: string;
  evidenceRequired: boolean;
  evidenceRecorded: boolean;
  items: { evidenceType: string; captureMethod: string; maskedReference?: string; verificationStatus?: string }[];
  correlationId: string;
}

export interface StatutoryBenefitReviewFilters {
  status: "PENDING" | "APPROVED" | "REJECTED" | "ALL";
  siteReference?: string;
  sourceChannel?: "WEBPAY" | "ASSISTED_PAYMENT_TERMINAL";
  benefitType?: "SENIOR_CITIZEN" | "PWD";
  submittedFrom?: string;
  submittedTo?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export interface StatutoryBenefitReviewClient {
  list(filters: StatutoryBenefitReviewFilters, signal?: AbortSignal): Promise<StatutoryBenefitReviewQueue>;
  get(reference: string, signal?: AbortSignal): Promise<StatutoryBenefitReviewDetail>;
  evidence(reference: string, signal?: AbortSignal): Promise<StatutoryBenefitEvidence>;
  decide(reference: string, body: { decision: "APPROVE" | "REJECT"; rejectionReason?: string; expectedVersion: number; idempotencyKey: string }): Promise<unknown>;
  clearRuntimeState(): void;
}

export function createStatutoryBenefitReviewClient(api: CentralPmsApiClient): StatutoryBenefitReviewClient {
  return {
    async list(filters, signal) {
      const query = new URLSearchParams({ status: filters.status, page: String(filters.page), pageSize: String(filters.pageSize) });
      for (const [key, value] of Object.entries(filters)) {
        if (["status", "page", "pageSize"].includes(key) || value === undefined || value === "") continue;
        query.set(key, String(value));
      }
      return parseQueue(await api.request(`/v1/management-platform/statutory-benefit-requests?${query}`, { signal, requireJsonContentType: true }));
    },
    async get(reference, signal) {
      assertUuid(reference, "decisionCommandReference");
      return parseDetail(await api.request(`/v1/management-platform/statutory-benefit-requests/${encodeURIComponent(reference)}`, { signal, requireJsonContentType: true }));
    },
    async evidence(reference, signal) {
      assertUuid(reference, "decisionCommandReference");
      return parseEvidence(await api.request(`/v1/management-platform/statutory-benefit-requests/${encodeURIComponent(reference)}/evidence`, { signal, requireJsonContentType: true }));
    },
    async decide(reference, body) {
      assertUuid(reference, "decisionCommandReference");
      return api.request(`/v1/management-platform/statutory-benefit-requests/${encodeURIComponent(reference)}/decision`, {
        method: "POST", body, requireJsonContentType: true
      });
    },
    clearRuntimeState() {}
  };
}

export function parseQueue(value: unknown): StatutoryBenefitReviewQueue {
  const row = object(value);
  contract(row);
  const items = array(row.items).map(parseQueueItem);
  return {
    contractVersion: statutoryBenefitReviewContractVersion,
    items,
    page: positiveInteger(row.page, "page"),
    pageSize: positiveInteger(row.pageSize, "pageSize"),
    totalCount: nonNegativeInteger(row.totalCount, "totalCount"),
    hasMore: boolean(row.hasMore, "hasMore"),
    correlationId: uuid(row.correlationId, "correlationId")
  };
}

export function parseDetail(value: unknown): StatutoryBenefitReviewDetail {
  const row = object(value);
  contract(row);
  const item = parseQueueItem(row);
  const money = row.money === null || row.money === undefined ? undefined : parseMoney(row.money);
  const decision = row.decision === null || row.decision === undefined ? undefined : parseDecision(row.decision);
  return {
    ...item,
    idDocumentType: optionalString(row.idDocumentType),
    issuingAuthority: optionalString(row.issuingAuthority),
    expiryDate: optionalDate(row.expiryDate),
    maskedIdReference: optionalString(row.maskedIdReference),
    requesterAttestation: boolean(row.requesterAttestation, "requesterAttestation"),
    submissionReason: optionalString(row.submissionReason),
    money,
    decision,
    version: positiveInteger(row.version, "version")
  };
}

export function parseEvidence(value: unknown): StatutoryBenefitEvidence {
  const row = object(value);
  contract(row);
  return {
    contractVersion: statutoryBenefitReviewContractVersion,
    decisionCommandReference: uuid(row.decisionCommandReference, "decisionCommandReference"),
    evidenceRequired: boolean(row.evidenceRequired, "evidenceRequired"),
    evidenceRecorded: boolean(row.evidenceRecorded, "evidenceRecorded"),
    items: array(row.items).map((entry) => {
      const item = object(entry);
      return { evidenceType: string(item.evidenceType, "evidenceType"), captureMethod: string(item.captureMethod, "captureMethod"), maskedReference: optionalString(item.maskedReference), verificationStatus: optionalString(item.verificationStatus) };
    }),
    correlationId: uuid(row.correlationId, "correlationId")
  };
}

function parseQueueItem(value: unknown): StatutoryBenefitReviewQueueItem {
  const row = object(value);
  const source = enumValue(row.sourceChannel, ["WEBPAY", "ASSISTED_PAYMENT_TERMINAL"] as const, "sourceChannel");
  const benefit = enumValue(row.benefitType, ["SENIOR_CITIZEN", "PWD"] as const, "benefitType");
  const status = enumValue(row.status, ["PENDING_REVIEW", "APPROVED", "REJECTED"] as const, "status");
  return {
    requestReference: uuid(row.requestReference, "requestReference"),
    decisionCommandReference: uuid(row.decisionCommandReference, "decisionCommandReference"),
    parkingSessionReference: uuid(row.parkingSessionReference, "parkingSessionReference"),
    ticketReference: optionalString(row.ticketReference),
    siteReference: uuid(row.siteReference, "siteReference"),
    siteCode: string(row.siteCode, "siteCode"),
    siteName: string(row.siteName, "siteName"), sourceChannel: source, benefitType: benefit, status,
    evidenceRequired: boolean(row.evidenceRequired, "evidenceRequired"), evidenceRecorded: boolean(row.evidenceRecorded, "evidenceRecorded"),
    submittedAt: timestamp(row.submittedAt, "submittedAt"), reviewerDisplayName: optionalString(row.reviewerDisplayName), decidedAt: optionalTimestamp(row.decidedAt)
  };
}

function parseMoney(value: unknown) {
  const row = object(value);
  if (row.currency !== "PHP") throw malformed("Only PHP monetary facts are supported.");
  return { originalAmountMinorUnits: nonNegativeInteger(row.originalAmountMinorUnits, "originalAmountMinorUnits"), discountAmountMinorUnits: nonNegativeInteger(row.discountAmountMinorUnits, "discountAmountMinorUnits"), finalPayableAmountMinorUnits: nonNegativeInteger(row.finalPayableAmountMinorUnits, "finalPayableAmountMinorUnits"), currency: "PHP" as const };
}

function parseDecision(value: unknown) {
  const row = object(value);
  return { decision: enumValue(row.decision, ["APPROVE", "REJECT"] as const, "decision"), reason: optionalString(row.reason), reviewerDisplayName: string(row.reviewerDisplayName, "reviewerDisplayName"), decidedAt: timestamp(row.decidedAt, "decidedAt") };
}

function contract(row: Record<string, unknown>) { if (row.contractVersion !== statutoryBenefitReviewContractVersion) throw malformed("Unsupported statutory-benefit review contract."); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw malformed("Malformed statutory-benefit review response."); return value as Record<string, unknown>; }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw malformed("Malformed statutory-benefit review collection."); return value; }
function string(value: unknown, field: string): string { if (typeof value !== "string" || !value.trim()) throw malformed(`Invalid ${field}.`); return value; }
function optionalString(value: unknown): string | undefined { return value === null || value === undefined ? undefined : string(value, "text"); }
function boolean(value: unknown, field: string): boolean { if (typeof value !== "boolean") throw malformed(`Invalid ${field}.`); return value; }
function nonNegativeInteger(value: unknown, field: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw malformed(`Invalid ${field}.`); return value; }
function positiveInteger(value: unknown, field: string): number { const result = nonNegativeInteger(value, field); if (result < 1) throw malformed(`Invalid ${field}.`); return result; }
function timestamp(value: unknown, field: string): string { const result = string(value, field); if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || Number.isNaN(Date.parse(result))) throw malformed(`Invalid ${field}.`); return result; }
function optionalTimestamp(value: unknown): string | undefined { return value === null || value === undefined ? undefined : timestamp(value, "timestamp"); }
function optionalDate(value: unknown): string | undefined { if (value === null || value === undefined) return undefined; const result = string(value, "date"); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw malformed("Invalid date."); return result; }
function uuid(value: unknown, field: string): string { const result = string(value, field); assertUuid(result, field); return result; }
function assertUuid(value: string, field: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw malformed(`Invalid ${field}.`); }
function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] { if (typeof value !== "string" || !allowed.includes(value)) throw malformed(`Invalid ${field}.`); return value as T[number]; }
function malformed(message: string): Error { return Object.assign(new Error(message), { kind: "malformed-response", code: "STATUTORY_BENEFIT_REVIEW_MALFORMED_RESPONSE", retryable: false, mutationUncertain: false }); }

import type { CentralPmsApiClient } from "./types";

export const configurationAdministrationRoute = "/management-platform/configuration";

export type SiteConfiguration = {
  siteId: string; siteGroupId: string; siteCode: string; siteName: string; siteType: string;
  timezoneName: string; addressLine1?: string | null; addressLine2?: string | null;
  city?: string | null; province?: string | null; countryCode: string;
  localGovernmentUnitId?: string | null; status: string; publicLookupEnabled: boolean;
  paymentEnabled: boolean; effectiveFrom: string; effectiveTo?: string | null; rowVersion: number;
};

export type SiteGroupConfiguration = {
  siteGroupId: string; siteGroupCode: string; siteGroupName: string; timezoneName: string;
  currencyCode: string; status: string;
};

export type JurisdictionConfiguration = {
  jurisdictionId: string; jurisdictionCode: string; jurisdictionType: string; displayName: string;
  psgcCode?: string | null; provinceName?: string | null; regionName?: string | null;
  countryCode: string; status: string; effectiveFrom?: string | null; effectiveTo?: string | null; rowVersion: number;
};

export type StatutoryPolicyConfiguration = {
  policyId: string; policyCode: string; policyName: string; entitlementType: string;
  localGovernmentUnitId?: string | null; benefitType: string; residencyScope: string;
  requiresEvidence: boolean; requiredEvidenceType?: string | null; verificationStatus: string;
  status: string; effectiveFrom: string; effectiveTo?: string | null; rowVersion: number;
  policyVersionId?: string | null; policyVersion?: string | null; publicationStatus?: string | null;
};

export type StatutoryPolicyDraft = {
  policyCode: string; policyName: string; policyVersion: string; localGovernmentUnitId: string;
  entitlementType: "SENIOR_CITIZEN" | "PWD"; benefitType: string; residencyScope: string;
  discountBaseScope: string; requiresEvidence: boolean; requiredEvidenceType?: string | null;
  ordinanceReference: string; sourceReference: string; fullFeeExempt: boolean;
  freeDurationMinutes?: number | null; discountPercentageBasisPoints?: number | null;
  effectiveFrom: string;
};

export type TariffRuleConfiguration = {
  ruleId?: string | null; sequence: number; ruleScope: "DURATION" | "CLOCK_TIME";
  chargeType: "UNIT_DURATION" | "FLAT_RATE" | "SESSION";
  durationStartMinutes?: number | null; durationEndMinutes?: number | null;
  clockStartTime?: string | null; clockEndTime?: string | null; amountMinorUnits: number;
  billingUnitMinutes?: number | null; roundingRule?: "WHOLE_STARTED_HOUR" | null;
};

export type SiteTariffConfiguration = {
  tariffId?: string | null; siteId: string; siteName?: string | null; vehicleTypeCode: string;
  tariffCode: string; tariffName: string; version: string; currencyCode: string;
  parkingGracePeriodMinutes: number; postPaymentExitGraceMinutes?: number | null;
  dailyMaxFeeMinorUnits?: number | null; quoteValidityMinutes: number;
  effectiveFrom: string; effectiveTo?: string | null; status: "DRAFT" | "ACTIVE" | "RETIRED";
  verified: boolean; rowVersion: number; rules: TariffRuleConfiguration[];
};

export type TariffPreview = {
  success: boolean; failureCode?: string | null; elapsedMinutes: number; chargeableMinutes: number;
  amountMinorUnits?: number | null; currency?: string | null; tariffVersion?: string | null;
  appliedRuleIds: string[];
};

export type ConfigurationAdministrationClient = ReturnType<typeof createConfigurationAdministrationClient>;

export function createConfigurationAdministrationClient(api: CentralPmsApiClient) {
  const root = "/v1/management-platform/configuration";
  return {
    listSites: () => api.request<SiteConfiguration[]>(`${root}/sites`, { requireJsonContentType: true }),
    listSiteGroups: () => api.request<SiteGroupConfiguration[]>(`${root}/site-groups`, { requireJsonContentType: true }),
    saveSite: (value: SiteConfiguration) => api.request<SiteConfiguration>(value.siteId ? `${root}/sites/${value.siteId}` : `${root}/sites`, { method: value.siteId ? "PUT" : "POST", body: value, requireJsonContentType: true }),
    listLgus: () => api.request<JurisdictionConfiguration[]>(`${root}/lgus`, { requireJsonContentType: true }),
    saveLgu: (value: JurisdictionConfiguration) => api.request<JurisdictionConfiguration>(value.jurisdictionId ? `${root}/lgus/${value.jurisdictionId}` : `${root}/lgus`, { method: value.jurisdictionId ? "PUT" : "POST", body: value, requireJsonContentType: true }),
    listStatutoryPolicies: (lguId?: string) => api.request<StatutoryPolicyConfiguration[]>(`${root}/statutory-discounts${lguId ? `?lguId=${encodeURIComponent(lguId)}` : ""}`, { requireJsonContentType: true }),
    createStatutoryPolicyDraft: (value: StatutoryPolicyDraft) => api.request<StatutoryPolicyConfiguration>(`${root}/statutory-discounts`, { method: "POST", body: value, requireJsonContentType: true }),
    activateStatutoryPolicy: (value: StatutoryPolicyConfiguration) => api.request<StatutoryPolicyConfiguration>(`${root}/statutory-discounts/${value.policyId}/activate`, { method: "POST", body: { expectedRowVersion: value.rowVersion }, requireJsonContentType: true }),
    retireStatutoryPolicy: (value: StatutoryPolicyConfiguration) => api.request<StatutoryPolicyConfiguration>(`${root}/statutory-discounts/${value.policyId}/retire`, { method: "POST", body: { expectedRowVersion: value.rowVersion }, requireJsonContentType: true }),
    listTariffs: (siteId?: string, vehicleType?: string) => {
      const query = new URLSearchParams(); if (siteId) query.set("siteId", siteId); if (vehicleType) query.set("vehicleType", vehicleType);
      return api.request<SiteTariffConfiguration[]>(`${root}/site-tariffs${query.size ? `?${query}` : ""}`, { requireJsonContentType: true });
    },
    saveTariff: (value: SiteTariffConfiguration) => api.request<SiteTariffConfiguration>(value.tariffId ? `${root}/site-tariffs/${value.tariffId}` : `${root}/site-tariffs`, { method: value.tariffId ? "PUT" : "POST", body: value, requireJsonContentType: true }),
    previewTariff: (tariff: SiteTariffConfiguration, entryTimestamp: string, calculationTimestamp: string) => api.request<TariffPreview>(`${root}/site-tariffs/preview`, { method: "POST", body: { tariff, entryTimestamp, calculationTimestamp }, requireJsonContentType: true }),
    verifyTariff: (value: SiteTariffConfiguration, entryTimestamp: string, calculationTimestamp: string) => api.request<SiteTariffConfiguration>(`${root}/site-tariffs/${value.tariffId}/verify`, { method: "POST", body: { expectedRowVersion: value.rowVersion, entryTimestamp, calculationTimestamp }, requireJsonContentType: true }),
    activateTariff: (value: SiteTariffConfiguration) => api.request<SiteTariffConfiguration>(`${root}/site-tariffs/${value.tariffId}/activate`, { method: "POST", body: { expectedRowVersion: value.rowVersion }, requireJsonContentType: true }),
    retireTariff: (value: SiteTariffConfiguration) => api.request<SiteTariffConfiguration>(`${root}/site-tariffs/${value.tariffId}/retire`, { method: "POST", body: { expectedRowVersion: value.rowVersion }, requireJsonContentType: true })
  };
}

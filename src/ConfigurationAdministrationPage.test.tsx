import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfigurationAdministrationPage } from "./ConfigurationAdministrationPage";
import type { ConfigurationAdministrationClient } from "./configurationAdministration";

const site = { siteId: "2d1dcdf8-f563-537c-8542-0bde7cc9da97", siteGroupId: "11111111-1111-1111-1111-111111111111", siteCode: "PITX-L3", siteName: "PITX Level 3", siteType: "CAR_PARK", timezoneName: "Asia/Manila", countryCode: "PH", localGovernmentUnitId: "22222222-2222-2222-2222-222222222222", status: "ACTIVE", publicLookupEnabled: true, paymentEnabled: true, effectiveFrom: "2026-10-06T00:00:00+08:00", rowVersion: 1 };
const tariff = { tariffId: "b6ec5a68-828d-5f0a-8f5c-f79926279736", siteId: site.siteId, siteName: site.siteName, vehicleTypeCode: "CAR", tariffCode: "PITX-L3-CAR", tariffName: "PITX Level 3 Car Parking", version: "PITX-L3-CAR-V1", currencyCode: "PHP", parkingGracePeriodMinutes: 15, postPaymentExitGraceMinutes: null, dailyMaxFeeMinorUnits: null, quoteValidityMinutes: 5, effectiveFrom: site.effectiveFrom, effectiveTo: null, status: "ACTIVE" as const, verified: true, rowVersion: 1, rules: [{ ruleId: "33333333-3333-3333-3333-333333333333", sequence: 1, ruleScope: "DURATION" as const, chargeType: "UNIT_DURATION" as const, durationStartMinutes: 0, durationEndMinutes: null, clockStartTime: null, clockEndTime: null, amountMinorUnits: 5000, billingUnitMinutes: 60, roundingRule: "WHOLE_STARTED_HOUR" as const }] };

function client(): ConfigurationAdministrationClient {
  return {
    listSites: vi.fn().mockResolvedValue([site]),
    listSiteGroups: vi.fn().mockResolvedValue([{ siteGroupId: site.siteGroupId, siteGroupCode: "PITX", siteGroupName: "PITX", timezoneName: "Asia/Manila", currencyCode: "PHP", status: "ACTIVE" }]),
    saveSite: vi.fn(), listLgus: vi.fn().mockResolvedValue([{ jurisdictionId: site.localGovernmentUnitId, jurisdictionCode: "PH-137604000", jurisdictionType: "CITY", displayName: "City of Paranaque", psgcCode: "1376040000", countryCode: "PH", status: "ACTIVE", rowVersion: 1 }]),
    saveLgu: vi.fn(), listStatutoryPolicies: vi.fn().mockResolvedValue([]), createStatutoryPolicyDraft: vi.fn(), activateStatutoryPolicy: vi.fn(), retireStatutoryPolicy: vi.fn(), listTariffs: vi.fn().mockResolvedValue([tariff]),
    saveTariff: vi.fn().mockResolvedValue(tariff), previewTariff: vi.fn().mockResolvedValue({ success: true, elapsedMinutes: 76, chargeableMinutes: 61, amountMinorUnits: 10000, currency: "PHP", tariffVersion: "EXITPASS-CONTINUITY:PITX-L3-CAR-V1", appliedRuleIds: [] }), verifyTariff: vi.fn(), activateTariff: vi.fn(), retireTariff: vi.fn()
  };
}

describe("ConfigurationAdministrationPage", () => {
  it("shows canonical Site and LGU catalogs", async () => {
    render(<ConfigurationAdministrationPage client={client()} permissions={["site.view", "jurisdiction.view"]} />);
    expect(await screen.findByText("PITX Level 3")).toBeInTheDocument();
    expect(screen.getByText("City of Paranaque")).toBeInTheDocument();
  });

  it("shows the approved PITX CAR tariff without an implicit motorcycle tariff", async () => {
    const user = userEvent.setup(); render(<ConfigurationAdministrationPage client={client()} permissions={["site-tariff.view"]} />);
    await screen.findByText("PITX Level 3"); await user.click(screen.getByRole("tab", { name: "Site Tariffs" }));
    expect(screen.getByText(/PITX CAR: ₱50.00 \/ 60 min, 15-minute grace/)).toBeInTheDocument();
    expect(screen.getByText("CAR")).toBeInTheDocument();
    expect(screen.queryByText("MOTORCYCLE")).not.toBeInTheDocument();
  });

  it("uses the Central PMS preview endpoint", async () => {
    const api = client(); const user = userEvent.setup(); render(<ConfigurationAdministrationPage client={api} permissions={["site-tariff.view", "site-tariff.manage"]} />);
    await screen.findByText("PITX Level 3"); await user.click(screen.getByRole("tab", { name: "Site Tariffs" }));
    await user.click(screen.getByRole("button", { name: "View" })); await user.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(api.previewTariff).toHaveBeenCalled());
    expect(await screen.findByText(/amount ₱100.00/)).toBeInTheDocument();
  });

  it("edits ordered tariff rules and sends them to Central PMS", async () => {
    const api = client(); const user = userEvent.setup();
    render(<ConfigurationAdministrationPage client={api} permissions={["site-tariff.view", "site-tariff.manage"]} />);
    await screen.findByText("PITX Level 3"); await user.click(screen.getByRole("tab", { name: "Site Tariffs" }));
    await user.click(screen.getByRole("button", { name: "New tariff version" }));
    await user.type(screen.getByLabelText("Tariff code"), "PITX-L3-CAR-V2");
    await user.type(screen.getByLabelText("Tariff name"), "PITX Level 3 Car V2");
    await user.type(screen.getByLabelText("Version"), "PITX-L3-CAR-V2");
    await user.type(screen.getByLabelText("Rule 1 duration to"), "180");
    await user.click(screen.getByRole("button", { name: "Add Rule" }));
    expect(screen.getByLabelText("Rule 2 duration from")).toHaveValue(180);
    await user.selectOptions(screen.getByLabelText("Rule 2 charge type"), "FLAT_RATE");
    await user.type(screen.getByLabelText("Rule 2 amount"), "2000");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() => expect(api.saveTariff).toHaveBeenCalledOnce());
    const saved = vi.mocked(api.saveTariff).mock.calls[0][0];
    expect(saved.rules).toHaveLength(2);
    expect(saved.rules.map(rule => rule.sequence)).toEqual([1, 2]);
    expect(saved.rules[1]).toMatchObject({ chargeType: "FLAT_RATE", durationStartMinutes: 180, billingUnitMinutes: null, roundingRule: null });
  });
});

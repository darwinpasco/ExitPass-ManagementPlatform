import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createCentralPmsApiClient } from "./apiClient";
import {
  createPolicyCoverageClient,
  policyCoverageApiRoute,
  type PolicyCoverageClient,
  type PolicyCoverageResponse
} from "./policyCoverage";
import { managementDashboardPermission, managementPlatformOverviewPermission, statutoryDiscountPolicyCoverageReadPermission } from "./permissions";
import type { ManagementPlatformAuthState } from "./types";

const route = "/management-platform/statutory-policy-coverage";
const siteA = {
  siteId: "71000000-0000-0000-0000-000000000101",
  siteGroupId: "71000000-0000-0000-0000-000000000900",
  siteGroupDisplayName: "Development Site Group",
  sitePosServerId: "72000000-0000-0000-0000-000000000101",
  displayName: "Development Site Alpha"
};
const siteB = {
  siteId: "71000000-0000-0000-0000-000000000102",
  siteGroupId: "71000000-0000-0000-0000-000000000900",
  siteGroupDisplayName: "Development Site Group",
  sitePosServerId: "72000000-0000-0000-0000-000000000102",
  displayName: "Development Site Beta"
};

function authState(permissions = [managementDashboardPermission, statutoryDiscountPolicyCoverageReadPermission]): ManagementPlatformAuthState {
  return {
    status: "authenticated",
    principal: {
      authenticated: true,
      subjectRef: "policy-reader",
      displayName: "Policy Reader",
      permissions,
      authorizedSites: [siteA, siteB]
    }
  };
}

describe("Management Platform statutory policy coverage navigation", () => {
  it("shows navigation only with statutory policy coverage read permission", () => {
    const { rerender } = render(<App authState={authState()} initialPath="/management-platform" policyCoverageClient={clientWith(coverage())} />);

    expect(screen.getByRole("button", { name: /Statutory Policy Coverage Read-only/i })).toBeInTheDocument();

    rerender(<App authState={authState([managementPlatformOverviewPermission])} initialPath="/management-platform" policyCoverageClient={clientWith(coverage())} />);

    expect(screen.queryByRole("button", { name: /Statutory Policy Coverage/i })).not.toBeInTheDocument();
  });

  it("shows access denied on direct route without permission", () => {
    render(<App authState={authState([managementPlatformOverviewPermission])} initialPath={route} policyCoverageClient={clientWith(coverage())} />);

    expect(screen.getByRole("alert", { name: "Permission denied" })).toHaveTextContent("does not have permission");
    expect(screen.queryByRole("heading", { name: "Statutory Policy Coverage" })).not.toBeInTheDocument();
  });
});

describe("Management Platform statutory policy coverage client", () => {
  it("uses the exact relative I-004 Management Platform route with safe query parameters", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain(policyCoverageApiRoute);
      expect(url).toContain("scopeType=SITE_GROUP");
      expect(url).toContain("scopeId=71000000-0000-0000-0000-000000000900");
      expect(url).toContain("entitlementType=SENIOR_CITIZEN");
      expect(url).toContain("includeInactive=true");
      expect(init?.method).toBe("GET");
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Correlation-Id")).toBeTruthy();
      expect(headers.get("X-ExitPass-Permissions")).toBeNull();
      expect(headers.get("X-Management-Platform-Permissions")).toBeNull();
      expect(headers.get("X-ExitPass-Service-Identity-Id")).toBeNull();
      return jsonResponse(coverage(), 200, "corr-policy");
    });

    const client = createPolicyCoverageClient(createCentralPmsApiClient({ fetchImpl }));

    await expect(client.getCoverage({
      scopeType: "SITE_GROUP",
      scopeId: "71000000-0000-0000-0000-000000000900",
      entitlementType: "SENIOR_CITIZEN",
      includeInactive: true
    })).resolves.toMatchObject({ correlationId: "corr-policy-coverage" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed coverage safely", async () => {
    const client = createPolicyCoverageClient(createCentralPmsApiClient({
      fetchImpl: vi.fn(async () => jsonResponse({ coverageRows: [] }, 200, "corr-malformed"))
    }));

    await expect(client.getCoverage({ scopeType: "SITE", scopeId: siteA.siteId, includeInactive: true })).rejects.toMatchObject({
      kind: "malformed-response",
      message: "The statutory policy coverage response could not be read safely."
    });
  });
});

describe("Management Platform statutory policy coverage workspace", () => {
  it("renders Site Group coverage, combined entitlements, classifications, support reference, and no mutation controls", async () => {
    render(<App authState={authState()} initialPath={route} policyCoverageClient={clientWith(coverage())} />);

    await expectCoverageLoaded();

    expect(screen.getAllByText("Development Site Group").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Senior Citizen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PWD").length).toBeGreaterThan(0);
    expect(screen.getByText("Active covered")).toBeInTheDocument();
    expect(screen.getByText("Future effective")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByText("Incomplete configuration")).toBeInTheDocument();
    expect(screen.getByText("corr-policy-coverage")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create|Edit|Delete|Activate|Deactivate|Upload|Approve|Apply|Override|Recalculate|Publish|Import/i })).not.toBeInTheDocument();
  });

  it("requests Site coverage and Senior Citizen filtering from authorized controls", async () => {
    const user = userEvent.setup();
    const client = clientWith(coverage());

    render(<App authState={authState()} initialPath={route} policyCoverageClient={client} />);

    await expectCoverageLoaded();
    await user.selectOptions(screen.getByLabelText("Scope type"), "SITE");
    await user.selectOptions(screen.getByLabelText("Site"), siteB.siteId);
    await user.selectOptions(screen.getByLabelText("Entitlement type"), "SENIOR_CITIZEN");

    await waitFor(() => expect(client.getCoverage).toHaveBeenLastCalledWith(
      expect.objectContaining({ scopeType: "SITE", scopeId: siteB.siteId, entitlementType: "SENIOR_CITIZEN" }),
      expect.any(AbortSignal)
    ));
  });

  it("requests PWD filtering and include-inactive changes without mutation methods", async () => {
    const user = userEvent.setup();
    const client = clientWith(coverage());

    render(<App authState={authState()} initialPath={route} policyCoverageClient={client} />);

    await expectCoverageLoaded();
    await user.selectOptions(screen.getByLabelText("Entitlement type"), "PWD");
    await user.click(screen.getByLabelText(/Include inactive/i));

    await waitFor(() => expect(client.getCoverage).toHaveBeenLastCalledWith(
      expect.objectContaining({ entitlementType: "PWD", includeInactive: false }),
      expect.any(AbortSignal)
    ));
  });

  it("renders not-covered, no-policy, empty, malformed authoritative, and unsupported scope states safely", async () => {
    const { rerender } = render(<App authState={authState()} initialPath={route} policyCoverageClient={clientWith(noCoverage())} />);

    await expectCoverageLoaded();
    expect(screen.getByText("No applicable policy")).toBeInTheDocument();
    expect(screen.getByText("Entitlement not covered")).toBeInTheDocument();

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={clientWith({ ...coverage(), coverageRows: [] })} />);
    expect(await screen.findByRole("status", { name: "Empty statutory policy coverage" })).toBeInTheDocument();

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={clientWith(malformedAuthoritativeCoverage())} />);
    expect(await screen.findByText("Malformed authoritative record")).toBeInTheDocument();

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={clientWith(ambiguousCoverage())} />);
    expect(await screen.findByRole("status", { name: "Unsupported authoritative classification" })).toHaveTextContent("fail-closed");
    expect(screen.getByText("Unsupported classification: AMBIGUOUS_SCOPE")).toBeInTheDocument();
  });

  it("renders access denied, unavailable retry, timeout retry, malformed response, and unexpected failure safely", async () => {
    const { rerender } = render(<App authState={authState()} initialPath={route} policyCoverageClient={errorClient("site-scope-denied", "SCOPE_DENIED", true)} />);

    expect(await screen.findByRole("alert", { name: "Statutory policy coverage access denied" })).toHaveTextContent("SCOPE_DENIED");

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={errorClient("integration-unavailable", "POLICY_SOURCE_UNAVAILABLE", true)} />);
    expect(await screen.findByRole("alert", { name: "Statutory policy coverage unavailable" })).toHaveTextContent("Retryable: Yes");
    expect(screen.getByRole("button", { name: "Retry statutory policy coverage" })).toBeInTheDocument();

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={errorClient("timeout", "TRANSIENT_DEPENDENCY_FAILURE", true)} />);
    expect(await screen.findByRole("alert", { name: "Statutory policy coverage unavailable" })).toHaveTextContent("TRANSIENT_DEPENDENCY_FAILURE");

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={errorClient("malformed-response", "MANAGEMENT_PLATFORM_POLICY_COVERAGE_MALFORMED", false)} />);
    expect(await screen.findByRole("alert", { name: "Statutory policy coverage malformed" })).toHaveTextContent("could not be read safely");

    rerender(<App authState={authState()} initialPath={route} policyCoverageClient={errorClient("unknown", "UNEXPECTED_INTERNAL_FAILURE", false)} />);
    expect(await screen.findByRole("alert", { name: "Statutory policy coverage unavailable" })).toHaveTextContent("UNEXPECTED_INTERNAL_FAILURE");
    expect(document.body).not.toHaveTextContent("stack trace");
    expect(document.body).not.toHaveTextContent("SqlException");
  });

  it("shows loading, keyboard focus, visible semantic controls, and avoids browser storage", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();

    try {
      render(<App authState={authState()} initialPath={route} policyCoverageClient={delayedClient()} />);
      expect(screen.getByRole("status", { name: "Loading statutory policy coverage" })).toHaveTextContent("Loading read-only coverage");
      await expectCoverageLoaded();

      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dashboard" }));
      await user.tab();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: /Statutory Policy Coverage Read-only/i }));
      expect(screen.getByLabelText("Scope type")).toBeInTheDocument();
      expect(screen.getByLabelText("Entitlement type")).toBeInTheDocument();
      expect(storageSpy).not.toHaveBeenCalled();
    } finally {
      storageSpy.mockRestore();
    }
  });

  it("does not regress Sales Invoice Setup read workflow", async () => {
    render(<App authState={authState([managementPlatformOverviewPermission, "sales-invoice-profile.read"])} initialPath="/management-platform/sales-invoice-profiles" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sales Invoice Setups" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Statutory Policy Coverage" })).not.toBeInTheDocument();
  });
});

async function expectCoverageLoaded() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "Coverage rows" })).toBeInTheDocument());
}

function clientWith(value: PolicyCoverageResponse): PolicyCoverageClient {
  return {
    getCoverage: vi.fn(async () => value)
  };
}

function delayedClient(): PolicyCoverageClient {
  return {
    getCoverage: vi.fn(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 20));
      return coverage();
    })
  };
}

function errorClient(kind: string, code: string, retryable: boolean): PolicyCoverageClient {
  return {
    getCoverage: vi.fn(async () => {
      throw {
        kind,
        code,
        message: kind === "site-scope-denied"
          ? "The requested Site or Site Group is outside your authorized policy coverage scope."
          : kind === "malformed-response"
            ? "The statutory policy coverage response could not be read safely."
            : "The statutory policy coverage read failed safely.",
        correlationId: `test-${code.toLowerCase()}`,
        retryable,
        mutationUncertain: false
      };
    })
  };
}

function coverage(): PolicyCoverageResponse {
  return {
    requestedScopeType: "SITE_GROUP",
    requestedScopeReference: siteA.siteGroupId,
    resolvedScopeType: "SITE_GROUP",
    resolvedScopeReference: siteA.siteGroupId,
    scopeDisplayName: "Development Site Group",
    correlationId: "corr-policy-coverage",
    evaluationTimestamp: "2026-08-01T00:00:00Z",
    coverageRows: [
      row("SENIOR_CITIZEN", "ACTIVE_COVERED"),
      row("PWD", "FUTURE_EFFECTIVE", { effectiveFrom: "2026-09-01" }),
      row("PWD", "EXPIRED", { effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31", policyStatusClassification: "INACTIVE" }),
      row("SENIOR_CITIZEN", "INCOMPLETE_CONFIGURATION", { authoritativeCoverageAvailable: false, dataQualityClassification: "INCOMPLETE_CONFIGURATION" })
    ]
  };
}

function noCoverage(): PolicyCoverageResponse {
  return {
    ...coverage(),
    coverageRows: [
      row("SENIOR_CITIZEN", "NO_APPLICABLE_POLICY", { authoritativeCoverageAvailable: false, policyReference: null }),
      row("PWD", "ENTITLEMENT_NOT_COVERED", { authoritativeCoverageAvailable: false, policyReference: null })
    ]
  };
}

function malformedAuthoritativeCoverage(): PolicyCoverageResponse {
  return { ...coverage(), coverageRows: [row("PWD", "MALFORMED_AUTHORITATIVE_RECORD", { authoritativeCoverageAvailable: false, dataQualityClassification: "MALFORMED_AUTHORITATIVE_RECORD" })] };
}

function ambiguousCoverage(): PolicyCoverageResponse {
  return { ...coverage(), coverageRows: [row("PWD", "AMBIGUOUS_SCOPE", { authoritativeCoverageAvailable: false, reasonClassification: "AMBIGUOUS_SCOPE" })] };
}

function row(entitlementType: string, coverageClassification: string, overrides: Partial<PolicyCoverageResponse["coverageRows"][number]> = {}): PolicyCoverageResponse["coverageRows"][number] {
  return {
    siteReference: siteA.siteId,
    siteDisplayName: "Development Site Alpha",
    entitlementType,
    coverageClassification,
    policyStatusClassification: "ACTIVE",
    authoritativeCoverageAvailable: true,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    policyReference: `${entitlementType}-POLICY`,
    ordinanceOrLegalAuthorityReference: "SYNTHETIC_LOCAL_AUTHORITY",
    jurisdictionOrLocalityReference: "SYNTHETIC_LGU",
    policyVersionOrRevisionReference: "2026.1",
    lastAuthoritativeUpdateTimestamp: "2026-08-01T00:00:00Z",
    dataQualityClassification: "AUTHORITATIVE",
    reasonClassification: coverageClassification,
    sourceClassification: "LOCAL_DEVELOPMENT_FIXTURE",
    ...overrides
  };
}

function jsonResponse(body: unknown, status: number, correlationId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": correlationId
    }
  });
}

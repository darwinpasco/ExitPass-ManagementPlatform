import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createCentralPmsApiClient } from "./apiClient";
import {
  createRbacInventoryClient,
  rbacInventoryApiRoute,
  type RbacInventoryClient,
  type RbacInventoryResponse
} from "./rbacInventory";
import { managementPlatformIdentityRbacInventoryReadPermission, managementPlatformOverviewPermission } from "./permissions";
import type { ManagementPlatformAuthState } from "./types";

const accessControlRoute = "/management-platform/access-control";

const siteA = {
  siteId: "77000000-0000-0000-0000-000000000002",
  sitePosServerId: "88000000-0000-0000-0000-000000000002",
  displayName: "Terminal Parking / North Exit"
};

function authState(permissions = [managementPlatformOverviewPermission, managementPlatformIdentityRbacInventoryReadPermission], sites = [siteA]): ManagementPlatformAuthState {
  return {
    status: "authenticated",
    principal: {
      authenticated: true,
      subjectRef: "user-123",
      displayName: "RBAC Reader",
      permissions,
      authorizedSites: sites
    }
  };
}

describe("Management Platform RBAC inventory navigation", () => {
  it("shows Access Control navigation with inventory-read permission", () => {
    render(<App authState={authState()} initialPath="/management-platform" rbacInventoryClient={clientWith(inventory())} />);

    expect(screen.getByRole("button", { name: /Access Control RBAC Inventory/i })).toBeInTheDocument();
  });

  it("hides Access Control navigation without inventory-read permission", () => {
    render(<App authState={authState([managementPlatformOverviewPermission])} initialPath="/management-platform" rbacInventoryClient={clientWith(inventory())} />);

    expect(screen.queryByRole("button", { name: /Access Control RBAC Inventory/i })).not.toBeInTheDocument();
  });

  it("shows access denied on direct route without permission", () => {
    render(<App authState={authState([managementPlatformOverviewPermission])} initialPath={accessControlRoute} rbacInventoryClient={clientWith(inventory())} />);

    expect(screen.getByRole("alert", { name: "Permission denied" })).toHaveTextContent("does not have permission");
    expect(screen.queryByRole("heading", { name: "RBAC Inventory" })).not.toBeInTheDocument();
  });
});

describe("Management Platform RBAC inventory client", () => {
  it("uses the actual relative Central PMS Management Platform inventory route", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(rbacInventoryApiRoute);
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("X-Correlation-Id")).toBeTruthy();
      return jsonResponse(inventory(), 200);
    });

    const client = createRbacInventoryClient(createCentralPmsApiClient({ fetchImpl }));

    await expect(client.getInventory()).resolves.toMatchObject({ generatedAt: "2026-07-29T00:00:00Z" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed inventory safely", async () => {
    const client = createRbacInventoryClient(createCentralPmsApiClient({
      fetchImpl: vi.fn(async () => jsonResponse({ permissions: [] }, 200))
    }));

    await expect(client.getInventory()).rejects.toMatchObject({
      kind: "malformed-response",
      message: "The RBAC inventory response could not be read safely."
    });
  });
});

describe("Management Platform RBAC inventory page", () => {
  it("renders permission catalog, role bundles, domains, statuses, policies, and warnings", async () => {
    render(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={clientWith(inventory())} />);

    await expectInventoryLoaded();

    expect(screen.getByRole("heading", { name: "Permission Catalog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Role Bundles" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Named Policies And Capabilities" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Statutory review" })).toBeInTheDocument();
    expect(screen.getAllByText("Implemented and enforced").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Target-only").length).toBeGreaterThan(0);
    expect(screen.getByText("Blocked by persistence")).toBeInTheDocument();
    expect(screen.getByText("Operations Supervisor")).toBeInTheDocument();
    expect(screen.getByText("Service principals cannot approve or reject statutory requests.")).toBeInTheDocument();
    expect(screen.getByText("Human reviewers cannot invoke service-only payable application.")).toBeInTheDocument();
    expect(screen.getByText("Queue access does not imply evidence access.")).toBeInTheDocument();
    expect(screen.getByText("Policy administration does not imply review authority.")).toBeInTheDocument();
    expect(screen.getByText("Approval and rejection are independently assignable.")).toBeInTheDocument();
  });

  it("renders Site, Site Group, unresolved scope, partial data, and fail-closed guidance", async () => {
    render(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={clientWith(partialScopeInventory())} />);

    await expectInventoryLoaded();

    expect(screen.getByRole("heading", { name: "Site And Site Group Scope Posture" })).toBeInTheDocument();
    expect(screen.getByText("Synthetic Site Group")).toBeInTheDocument();
    expect(screen.getByText("Synthetic Site")).toBeInTheDocument();
    expect(screen.getByText("Unresolved Site Group")).toBeInTheDocument();
    expect(screen.getByText(/Unknown or unresolved scope fails closed/i)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Partial data" })).toHaveTextContent("fail-closed");
  });

  it("renders no current Site context without using browser-selected Site as a grant", async () => {
    render(<App authState={authState([managementPlatformIdentityRbacInventoryReadPermission], [])} initialPath={accessControlRoute} rbacInventoryClient={clientWith(inventory())} />);

    await expectInventoryLoaded();

    expect(screen.getByRole("status", { name: "No authorized Sites" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "No current Site context" })).toHaveTextContent("not an authorization grant");
  });

  it("renders empty inventory safely", async () => {
    render(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={clientWith(emptyInventory())} />);

    await expectInventoryLoaded();

    expect(screen.getByRole("status", { name: "Empty Access Control inventory" })).toHaveTextContent("no permissions");
  });

  it("renders backend unavailable and malformed response safely", async () => {
    const { rerender } = render(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={errorClient("integration-unavailable")} />);

    await waitFor(() => expect(screen.getByRole("status", { name: "Access Control inventory unavailable" })).toHaveTextContent("temporarily unavailable"));
    expect(document.body).not.toHaveTextContent("stack trace");
    expect(document.body).not.toHaveTextContent("SqlException");

    rerender(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={errorClient("malformed-response")} />);

    await waitFor(() => expect(screen.getByRole("alert", { name: "Access Control response unavailable" })).toHaveTextContent("could not be read safely"));
    expect(document.body).not.toHaveTextContent("raw backend");
  });

  it("filters by domain, actor class, implementation status, role bundle, and scope posture then resets", async () => {
    const user = userEvent.setup();

    render(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={clientWith(inventory())} />);

    await expectInventoryLoaded();
    const filter = screen.getByLabelText(/Search permissions/i);
    await user.type(filter, "Service");
    expect(screen.getByText("WebPay Service Application")).toBeInTheDocument();
    expect(screen.getByText("Payment-time application")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset filter" }));
    expect(filter).toHaveValue("");
    expect(screen.getByText("Operations Supervisor")).toBeInTheDocument();
  });

  it("does not render mutation controls, issue mutation requests, or write browser storage", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const client = clientWith(inventory());

    try {
      render(<App authState={authState()} initialPath={accessControlRoute} rbacInventoryClient={client} />);
      await expectInventoryLoaded();

      expect(client.getInventory).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: /Create|Edit|Assign|Revoke|Retire|Disable|Rotate|Approve grant/i })).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent("Save");
      expect(storageSpy).not.toHaveBeenCalled();
    } finally {
      storageSpy.mockRestore();
    }
  });

  it("existing Sales Invoice Setup route still renders read workflow", async () => {
    render(<App authState={authState([managementPlatformOverviewPermission, "sales-invoice-profile.read"])} initialPath="/management-platform/sales-invoice-profiles" />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sales Invoice Setups" })).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "RBAC Inventory" })).not.toBeInTheDocument();
  });
});

async function expectInventoryLoaded() {
  await waitFor(() => expect(screen.getByRole("heading", { name: "RBAC Inventory" })).toBeInTheDocument());
}

function clientWith(value: RbacInventoryResponse): RbacInventoryClient {
  return {
    getInventory: vi.fn(async () => value)
  };
}

function errorClient(kind: "integration-unavailable" | "malformed-response"): RbacInventoryClient {
  return {
    getInventory: vi.fn(async () => {
      throw {
        kind,
        code: "TEST_ERROR",
        message: kind === "integration-unavailable" ? "Access Control inventory is temporarily unavailable." : "The RBAC inventory response could not be read safely.",
        correlationId: `test-${kind}`,
        retryable: false,
        mutationUncertain: false
      };
    })
  };
}

function inventory(): RbacInventoryResponse {
  return {
    users: [],
    roleBundles: [
      {
        roleKey: "operations-supervisor",
        displayName: "Operations Supervisor",
        purpose: "Reviews statutory privilege eligibility without payment-time application authority.",
        typicalAccessRights: [
          "statutory-discounts.review.queue.read",
          "statutory-discounts.decision.approve",
          "statutory-discounts.decision.reject"
        ],
        defaultRestrictions: ["Requester cannot approve their own statutory request.", "No payable-basis application authority."],
        targetSurface: "Operator Console review"
      },
      {
        roleKey: "webpay-service-application",
        displayName: "WebPay Service Application",
        purpose: "Requests payment-time application.",
        typicalAccessRights: ["statutory-discounts.payable-basis.apply"],
        defaultRestrictions: ["Service principals cannot approve or reject."],
        targetSurface: "WebPay service integration"
      }
    ],
    permissions: [
      permission("management-platform.identity-rbac.inventory.read", "Identity/RBAC inventory read", "Management Platform", "implemented", ["ManagementPlatformIdentityRbacInventoryRead"]),
      permission("statutory-discounts.review.queue.read", "Review queue read", "Statutory review", "blocked-by-persistence", []),
      permission("statutory-discounts.decision.approve", "Approve statutory request", "Statutory review", "implemented", ["OperatorConsoleStatutoryDiscountDecisionReview"]),
      permission("statutory-discounts.decision.reject", "Reject statutory request", "Statutory review", "implemented", ["OperatorConsoleStatutoryDiscountDecisionReview"]),
      permission("statutory-discounts.evidence.view", "Evidence read", "Evidence", "implemented", ["OperatorConsoleStatutoryDiscountEvidenceView"]),
      permission("statutory-discount-policy.manage", "Policy manage", "Policy", "target-only", []),
      permission("statutory-discounts.payable-basis.apply", "Payment-time application", "WebPay service", "implemented-with-limitations", ["OperatorConsoleStatutoryDiscountPayableBasisApply"])
    ],
    policyMappings: [
      {
        policyName: "ManagementPlatformIdentityRbacInventoryRead",
        permissions: ["management-platform.identity-rbac.inventory.read"],
        routeOrFeatureArea: "Management Platform administration",
        implementedStatus: "implemented",
        notes: null
      }
    ],
    userRoleAssignments: [],
    userSiteScopes: [
      {
        userId: "77000000-0000-0000-0000-000000000010",
        siteGroupId: "71000000-0000-0000-0000-000000000900",
        siteId: "71000000-0000-0000-0000-000000000901",
        siteGroupName: "Synthetic Site Group",
        siteName: "Synthetic Site",
        source: "LOCAL_DEVELOPMENT",
        status: "ACTIVE"
      }
    ],
    deviceBindings: [],
    shifts: [],
    gaps: [
      {
        gapKey: "canonical-persistence-present-but-incomplete",
        severity: "High",
        summary: "Canonical persistence verdict is PRESENT_BUT_INCOMPLETE."
      }
    ],
    generatedAt: "2026-07-29T00:00:00Z"
  };
}

function partialScopeInventory(): RbacInventoryResponse {
  return {
    ...inventory(),
    userSiteScopes: [
      ...inventory().userSiteScopes,
      {
        userId: "77000000-0000-0000-0000-000000000010",
        siteGroupId: null,
        siteId: null,
        siteGroupName: "Unresolved Site Group",
        siteName: "Unresolved Site",
        source: "PRESENT_BUT_INCOMPLETE",
        status: "UNRESOLVED"
      }
    ]
  };
}

function emptyInventory(): RbacInventoryResponse {
  return {
    users: [],
    roleBundles: [],
    permissions: [],
    policyMappings: [],
    userRoleAssignments: [],
    userSiteScopes: [],
    deviceBindings: [],
    shifts: [],
    gaps: [],
    generatedAt: "2026-07-29T00:00:00Z"
  };
}

function permission(permissionKey: string, displayLabel: string, category: string, status: string, mappedPolicies: string[]) {
  return {
    permissionKey,
    displayLabel,
    category,
    sourceCatalog: mappedPolicies.length > 0 ? "CentralPmsRbacPolicyCatalog" : "ManagementPlatformTargetRoleModel",
    mappedPolicies,
    status,
    notes: mappedPolicies.length > 0 ? null : "Target access right; no current Central PMS policy mapping was returned."
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": "corr-rbac"
    }
  });
}

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdentityAdministrationPage } from "./IdentityAdministrationPage";
import { identityAdministrationPermissions, type IdentityAdministrationClient, type IdentityUserDetail } from "./identityAdministration";

describe("IdentityAdministrationPage", () => {
  it("renders a populated governed user list and coherent detail without raw identifiers", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Alex Rivera/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Alex Rivera/ }));
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByText(/alex\.rivera · User/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account Status" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("renders the empty authorized result distinctly", async () => {
    const client = mockClient();
    client.listUsers.mockResolvedValue([]);
    renderPage(client);
    expect(await screen.findByText("No users match the current search.")).toBeInTheDocument();
  });

  it("creates users without password or invented delivery controls", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/send email|send sms/i)).not.toBeInTheDocument();
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.type(within(form).getByLabelText("Username"), "new.user");
    await userEvent.type(within(form).getByLabelText("Display name"), "New User");
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_INVITE");
    await userEvent.click(within(form).getByRole("button", { name: "Add User" }));
    await waitFor(() => expect(client.createUser).toHaveBeenCalledOnce());
    expect(JSON.stringify(client.createUser.mock.calls[0][0])).not.toMatch(/password|totp|seed/i);
  });

  it("keeps GLOBAL fail-closed while offering only authorized Site and Site Group inputs", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    expect(screen.getAllByText(/Organization-wide access is not available/i).length).toBeGreaterThan(0);
    const scopeType = screen.getByLabelText("Access level");
    expect(within(scopeType).queryByRole("option", { name: /global/i })).not.toBeInTheDocument();
    expect(within(scopeType).getByRole("option", { name: "Site" })).toBeInTheDocument();
    expect(within(scopeType).getByRole("option", { name: "Site Group" })).toBeInTheDocument();
  });

  it("submits profile effectivity with the current row version", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    const form = screen.getByRole("heading", { name: "Edit Profile and Access Dates" }).closest("form")!;
    await userEvent.type(within(form).getByLabelText("Reason"), "PROFILE_REVIEWED");
    await userEvent.click(within(form).getByRole("button", { name: "Save Profile" }));
    await waitFor(() => expect(client.updateUser).toHaveBeenCalledOnce());
    expect(client.updateUser.mock.calls[0][1]).toMatchObject({ expectedRowVersion: 4, effectiveFrom: "2030-01-01T00:00:00.000Z" });
  });

  it("does not present privileged approval evidence as active authority", async () => {
    const client = mockClient();
    client.createPrivilegedAccessRequest.mockResolvedValue(privilegedRequest("APPROVED"));
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    const roleForm = screen.getByRole("heading", { name: "Add Role" }).closest("form")!;
    await userEvent.selectOptions(within(roleForm).getByLabelText("Role"), "22222222-2222-4222-8222-222222222222");
    await userEvent.type(within(roleForm).getByLabelText("Reason"), "TEMPORARY_SUPPORT");
    await userEvent.click(within(roleForm).getByRole("button", { name: "Add Role or Request Access" }));
    expect(await screen.findByText(/Approval records the decision but does not activate access/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Elevated Access" })).toBeInTheDocument();
    expect(screen.queryByText("Active Authority")).not.toBeInTheDocument();
  });

  it("shows MFA and sessions without secrets and uses deliberate revoke confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Security" }));
    expect(screen.getByRole("heading", { name: "Two-Factor Authentication" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active Sessions" })).toBeInTheDocument();
    expect(await screen.findByText("Required for elevated Management Platform access")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/totp-secret-value|session-secret-value|otpauth:\/\//i);
    await userEvent.click(screen.getByRole("button", { name: "Sign Out Session" }));
    await waitFor(() => expect(client.revokeSession).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("renders safe 403, anti-enumerating 404, conflict, and unavailable errors", async () => {
    for (const [kind, expected] of [["permission-denied", "Permission denied"], ["not-found", "User unavailable"], ["conflict", "Current information changed"], ["integration-unavailable", "User Administration unavailable"]] as const) {
      const client = mockClient();
      client.listUsers.mockRejectedValue({ kind, code: "SAFE", message: "Safe message", retryable: false, mutationUncertain: false });
      const { unmount } = renderPage(client);
      expect(await screen.findByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("writes no authentication, permission, scope, or sensitive draft authority to browser storage", async () => {
    const localSet = vi.spyOn(Storage.prototype, "setItem");
    renderPage();
    await screen.findByRole("button", { name: /Alex Rivera/ });
    expect(localSet).not.toHaveBeenCalled();
    localSet.mockRestore();
  });
});

function renderPage(client = mockClient()) {
  return render(<IdentityAdministrationPage client={client} permissions={Object.values(identityAdministrationPermissions)} authorizedSites={[{ siteId: "site-1", siteGroupId: "group-1", siteGroupDisplayName: "Metro Group", displayName: "Central Site" }]} authorizedSiteGroupReferences={["group-1"]} />);
}

function mockClient() {
  const user = userDetail();
  return {
    listUsers: vi.fn(async () => [user.user]), getUser: vi.fn(async () => user),
    createUser: vi.fn(async (_body: Record<string, unknown>) => user.user), updateUser: vi.fn(async (_reference: string, _body: Record<string, unknown>) => user.user), changeLifecycle: vi.fn(async () => user.user),
    listRoles: vi.fn(async () => [{ roleReference: "22222222-2222-4222-8222-222222222222", code: "SITE_OPERATOR", name: "Site Operator", description: "Site operations", type: "CUSTOM", status: "ACTIVE", isPrivileged: true, requiresElevatedApproval: true, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1 }]),
    listPermissions: vi.fn(async () => [{ permissionReference: "permission-1", code: "user.view", name: "View users", domain: "Identity", action: "VIEW", status: "ACTIVE", isSensitive: false, requiresAudit: true, rowVersion: 1 }]),
    assignRole: vi.fn(async () => user.roleAssignments[0]), revokeRole: vi.fn(async () => user.roleAssignments[0]), grantScope: vi.fn(async () => user.scopeGrants[0]), revokeScope: vi.fn(async () => user.scopeGrants[0]),
    createPrivilegedAccessRequest: vi.fn(async () => privilegedRequest("REQUESTED")), getPrivilegedAccessRequest: vi.fn(async () => privilegedRequest("REQUESTED")), decidePrivilegedAccess: vi.fn(async () => privilegedRequest("APPROVED")), reviewAccess: vi.fn(async () => true),
    listSessions: vi.fn(async () => [{ sessionReference: "session-1", audience: "MANAGEMENT_PLATFORM", status: "ACTIVE", assurance: "PASSWORD_TOTP", mfaRequirementSatisfied: true, deviceServiceIdentityReference: null, authenticatedAt: "2030-01-01T00:00:00Z", lastSeenAt: "2030-01-01T00:10:00Z", idleExpiresAt: "2030-01-01T00:30:00Z", absoluteExpiresAt: "2030-01-01T08:00:00Z", revokedAt: null, rowVersion: 1 }]),
    revokeSession: vi.fn(async () => undefined), getMfaStatus: vi.fn(async () => ({ requiredForPrivilegedManagementPlatform: true, enrolled: true, status: "ACTIVE", enrollmentStartedAt: null, activatedAt: "2030-01-01T00:00:00Z", lastSuccessfullyUsedAt: "2030-01-01T00:00:00Z", resetAt: null, revokedAt: null, rowVersion: 1 })), changeMfa: vi.fn(async () => ({ requiredForPrivilegedManagementPlatform: true, enrolled: false, status: "RESET_REQUIRED", enrollmentStartedAt: null, activatedAt: null, lastSuccessfullyUsedAt: null, resetAt: "2030-01-01T00:00:00Z", revokedAt: null, rowVersion: 2 })),
    listAuditEvents: vi.fn(async () => [{ auditReference: "audit-1", eventType: "ROLE_ASSIGNED", result: "SUCCESS", reasonCode: "AUTHORIZED", actorUserReference: null, summary: "Role assignment recorded.", occurredAt: "2030-01-01T00:00:00Z", correlationReference: "support-ref-1" }])
  } satisfies { [K in keyof IdentityAdministrationClient]: ReturnType<typeof vi.fn> };
}

function userDetail(): IdentityUserDetail { return { user: { userReference: "11111111-1111-4111-8111-111111111111", username: "alex.rivera", displayName: "Alex Rivera", maskedEmail: "a***@example.test", maskedMobileNumber: "***1234", userType: "HUMAN", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastLoginAt: "2030-01-01T00:00:00Z", rowVersion: 4 }, roleAssignments: [{ assignmentReference: "assignment-1", userReference: "11111111-1111-4111-8111-111111111111", roleReference: "22222222-2222-4222-8222-222222222222", roleCode: "SITE_OPERATOR", roleName: "Site Operator", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: null, rowVersion: 2 }], scopeGrants: [{ grantReference: "grant-1", assignmentReference: "assignment-1", scopeType: "SITE", siteReference: "site-1", siteGroupReference: null, status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: null, rowVersion: 2 }] }; }
function privilegedRequest(status: string) { return { requestReference: "request-1", targetUserReference: "user-1", requestedRoleReference: "role-1", requestedScopeType: null, requestedSiteReference: null, requestedSiteGroupReference: null, status, reasonCode: "AUTHORIZED", requestedEffectiveFrom: "2030-01-01T00:00:00Z", requestedEffectiveTo: null, requestedAt: "2030-01-01T00:00:00Z", requestedByUserReference: "admin-1", expiresAt: null, rowVersion: 1, decisions: [] }; }

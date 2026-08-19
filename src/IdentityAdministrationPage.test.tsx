import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdentityAdministrationPage } from "./IdentityAdministrationPage";
import { identityAdministrationPermissions, type IdentityAdministrationClient, type IdentityUserDetail, type IdentityUserSummary } from "./identityAdministration";

describe("IdentityAdministrationPage", () => {
  it("renders a populated governed user list and coherent detail without raw identifiers", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Alex Rivera/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Alex Rivera/ }));
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByText(/alex\.rivera · Site Operator/)).toBeInTheDocument();
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
    expect(within(form).getByLabelText("User type")).toHaveValue("");
    expect(Array.from((within(form).getByLabelText("User type") as HTMLSelectElement).options).map((option) => option.value)).toEqual([
      "", "SITE_OPERATOR"
    ]);
    await userEvent.type(within(form).getByLabelText("Username"), "new.user");
    await userEvent.type(within(form).getByLabelText("Display name"), "New User");
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_INVITE");
    expect(within(form).getByRole("button", { name: "Add User" })).toBeDisabled();
    expect(client.createUser).not.toHaveBeenCalled();
    await userEvent.selectOptions(within(form).getByLabelText("User type"), "SITE_OPERATOR");
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "33333333-3333-4333-8333-333333333333");
    expect(within(form).getByRole("button", { name: "Add User" })).toBeDisabled();
    await userEvent.selectOptions(within(form).getByLabelText("Assigned Site"), "site-1");
    expect(within(form).getByRole("button", { name: "Add User" })).toBeEnabled();
    await userEvent.click(within(form).getByRole("button", { name: "Add User" }));
    await waitFor(() => expect(client.createUser).toHaveBeenCalledOnce());
    expect(client.createUser.mock.calls[0][0]).toMatchObject({ userType: "SITE_OPERATOR", initialRoleReference: "33333333-3333-4333-8333-333333333333", initialScopeType: "SITE", initialSiteReference: "site-1", initialSiteGroupReference: null });
    expect(JSON.stringify(client.createUser.mock.calls[0][0])).not.toMatch(/password|totp|seed/i);
  });

  it("refreshes page one and opens the atomically created user", async () => {
    const client = mockClient();
    const created = { ...userDetail().user, userReference: "created-user", username: "new.operator", displayName: "New Operator", status: "INVITED" };
    client.createUser.mockResolvedValue(created);
    client.listUsers.mockResolvedValueOnce([userDetail().user]).mockResolvedValueOnce([created, userDetail().user]);
    client.getUser.mockImplementation(async (reference: string) => reference === created.userReference ? { ...userDetail(), user: created } : userDetail());
    renderPage(client);

    await screen.findByRole("button", { name: /Alex Rivera/ });
    await userEvent.type(screen.getByLabelText("Search users"), "old filter");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "ACTIVE");
    await userEvent.click(screen.getByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.type(within(form).getByLabelText("Username"), created.username);
    await userEvent.type(within(form).getByLabelText("Display name"), created.displayName);
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_INVITE");
    await userEvent.selectOptions(within(form).getByLabelText("Site access level"), "SITE_GROUP");
    await userEvent.selectOptions(within(form).getByLabelText("User type"), "SITE_OPERATOR");
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "33333333-3333-4333-8333-333333333333");
    await userEvent.selectOptions(within(form).getByLabelText("Assigned Site Group"), "group-1");
    await userEvent.click(within(form).getByRole("button", { name: "Add User" }));

    expect(await screen.findByRole("heading", { name: "New Operator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search users")).toHaveValue("");
    expect(screen.getByLabelText("Status")).toHaveValue("");
    expect(screen.getByText("2 returned")).toBeInTheDocument();
    expect(client.listUsers).toHaveBeenLastCalledWith({ query: undefined, status: undefined, offset: 0, limit: 50 });
    expect(client.createUser).toHaveBeenCalledWith(expect.objectContaining({ initialScopeType: "SITE_GROUP", initialSiteReference: null, initialSiteGroupReference: "group-1" }));
    expect(screen.getByText("User added with an initial role and access assignment.")).toBeInTheDocument();
  });

  it("offers only compatible business roles and clears an incompatible selection when user type changes", async () => {
    const client = mockClient();
    client.listRoles.mockResolvedValue([
      role("H007_DENIED", "H-007 Denied User", "synthetic-denied"),
      role("H007_SITE_ADMIN", "H-007 Site Administrator", "synthetic-site-admin"),
      role("OPERATOR_SUPPORT_STAFF", "Operator / Support Staff", "site-admin"),
      role("SITE_OPERATOR", "Site Operator", "site-operator"),
      role("SUPPORT_AGENT", "Support Agent", "support")
    ]);
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    const userType = within(form).getByLabelText("User type");
    const initialRole = within(form).getByLabelText("Initial role");

    expect(within(form).queryByText(/H-007 Denied|H-007 Site Administrator/)).not.toBeInTheDocument();
    expect(Array.from((userType as HTMLSelectElement).options).map((option) => option.value)).toEqual(["", "SITE_OPERATOR", "SUPPORT_USER"]);
    await userEvent.selectOptions(userType, "SITE_OPERATOR");
    expect(Array.from((initialRole as HTMLSelectElement).options).map((option) => option.text)).toEqual(["Select a role", "Site Administrator", "Site Operator"]);
    await userEvent.selectOptions(initialRole, "site-operator");
    await userEvent.selectOptions(userType, "SUPPORT_USER");
    expect(initialRole).toHaveValue("");
    expect(Array.from((initialRole as HTMLSelectElement).options).map((option) => option.text)).toEqual(["Select a role", "Support Staff"]);
    expect(within(form).getByRole("button", { name: "Add User" })).toBeDisabled();
  });

  it("uses neutral access-assignment wording for a Site Group grant", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    const form = screen.getByRole("heading", { name: "Add Site Access" }).closest("form")!;
    await userEvent.selectOptions(within(form).getByLabelText("Access level"), "SITE_GROUP");
    await userEvent.selectOptions(within(form).getByLabelText("Site Group"), "group-1");
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_GROUP_ACCESS");
    await userEvent.click(within(form).getByRole("button", { name: "Add Access" }));

    expect(await screen.findByText("Access assignment added.")).toBeInTheDocument();
    expect(client.grantScope).toHaveBeenCalledWith(
      userDetail().user.userReference,
      "assignment-1",
      expect.objectContaining({ scopeType: "SITE_GROUP", siteReference: null, siteGroupReference: "group-1" })
    );
  });

  it("marks retained information stale and blocks every mutation family after an uncertain Add User failure", async () => {
    const client = mockClient();
    client.createUser.mockRejectedValue(uiError("unknown", "The request failed safely.", false, true));
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await screen.findByRole("heading", { name: "Alex Rivera" });

    await userEvent.click(screen.getByRole("button", { name: "Add User" }));
    const createForm = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.type(within(createForm).getByLabelText("Username"), "uncertain.user");
    await userEvent.type(within(createForm).getByLabelText("Display name"), "Uncertain User");
    await userEvent.type(within(createForm).getByLabelText("Reason"), "MANUAL_VALIDATION");
    await selectInitialAccess(createForm);
    await userEvent.click(within(createForm).getByRole("button", { name: "Add User" }));

    expect(await screen.findByText("Information may be out of date.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Profile" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Update Account Status" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Add User" })) expect(button).toBeDisabled();

    await userEvent.click(screen.getByRole("tab", { name: "Roles & Permissions" }));
    expect(screen.getByRole("button", { name: "Remove Role" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Role or Request Access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add Access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record Review" })).toBeDisabled();

    await userEvent.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Reset Authenticator App" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Authenticator App" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign Out Session" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign Out All Sessions" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Refresh authoritative state" }));
    await waitFor(() => expect(screen.queryByText("Information may be out of date.")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Sign Out Session" })).toBeEnabled();
    expect(client.createUser).toHaveBeenCalledOnce();
  });

  it("keeps authoritative controls available after a controlled 403 without marking data stale", async () => {
    const client = mockClient();
    client.createUser.mockRejectedValue(uiError("permission-denied", "You do not have permission for this action."));
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add User" }));
    const createForm = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.type(within(createForm).getByLabelText("Username"), "denied.user");
    await userEvent.type(within(createForm).getByLabelText("Display name"), "Denied User");
    await userEvent.type(within(createForm).getByLabelText("Reason"), "MANUAL_VALIDATION");
    await selectInitialAccess(createForm);
    await userEvent.click(within(createForm).getByRole("button", { name: "Add User" }));

    expect(await screen.findByText("Permission denied")).toBeInTheDocument();
    expect(screen.queryByText("Information may be out of date.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Profile" })).toBeEnabled();
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
    expect(screen.getByLabelText("Request reference")).toHaveValue("request-1");
    expect(screen.getByRole("heading", { name: "Elevated Access" })).toBeInTheDocument();
    expect(screen.queryByText("Active Authority")).not.toBeInTheDocument();
  });

  it("distinguishes successful empty catalogs from failed secondary requests and retries only the affected section", async () => {
    const client = mockClient();
    client.listRoles.mockRejectedValueOnce(uiError("integration-unavailable", "Role catalog is temporarily unavailable.", true)).mockResolvedValueOnce([]);
    client.listPermissions.mockRejectedValue(uiError("integration-unavailable", "Permission catalog is temporarily unavailable.", true));
    client.listSessions.mockRejectedValue(uiError("integration-unavailable", "Active Sessions are temporarily unavailable.", true));
    client.getMfaStatus.mockRejectedValue(uiError("permission-denied", "Two-Factor Authentication access is denied."));
    client.listAuditEvents.mockRejectedValue(uiError("integration-unavailable", "Activity Log is temporarily unavailable.", true));

    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));

    expect(await screen.findByText("Role catalog: Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No assignable roles were returned.")).not.toBeInTheDocument();
    expect(screen.getByText("Permission catalog: Unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/0 permissions are available/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(client.listPermissions).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Retry Role catalog" }));
    expect(await screen.findByText("No assignable roles were returned.")).toBeInTheDocument();
    expect(client.listRoles).toHaveBeenCalledTimes(2);
    expect(client.listPermissions).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("tab", { name: "Security" }));
    expect(await screen.findByText("Active Sessions: Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No active sessions returned.")).not.toBeInTheDocument();
    expect(screen.getByText("Two-Factor Authentication: Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Not set up")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry Two-Factor Authentication" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Activity Log" }));
    expect(await screen.findByText("Activity Log: Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No activity was returned for this user.")).not.toBeInTheDocument();
  });

  it("renders returned GLOBAL access as transparent read-only data while retaining governed Site revocation", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("GOVERNED_SCOPE_REMOVAL");
    const client = mockClient();
    const detail = userDetail();
    detail.scopeGrants.push({ ...detail.scopeGrants[0], grantReference: "global-grant", scopeType: "GLOBAL", siteReference: null, siteGroupReference: null });
    client.getUser.mockResolvedValue(detail);

    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    const globalRow = screen.getByText(/Organization.*access unavailable/i).closest("article")!;
    expect(within(globalRow).getByText("Read-only in Management Platform")).toBeInTheDocument();
    expect(within(globalRow).queryByRole("button")).not.toBeInTheDocument();
    globalRow.focus();
    await userEvent.keyboard("{Enter}");
    expect(client.revokeScope).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Remove Access" }));
    await waitFor(() => expect(client.revokeScope).toHaveBeenCalledOnce());
    expect(client.revokeScope.mock.calls[0][2]).toBe("grant-1");
    expect(within(screen.getByLabelText("Access level")).queryByRole("option", { name: /global/i })).not.toBeInTheDocument();
    prompt.mockRestore();
  });

  it("pages the directory with bounded offset controls and resets filters to the first page", async () => {
    const client = mockClient();
    client.listUsers.mockImplementation(async (filters = {}) => filters.offset === 50 ? pagedUsers(7, 50) : pagedUsers(50, 0));
    renderPage(client);

    expect(await screen.findByText("Page 1 · Showing 1-50")).toBeInTheDocument();
    expect(client.listUsers).toHaveBeenNthCalledWith(1, { query: undefined, status: undefined, offset: 0, limit: 50 });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Page 2 · Showing 51-57")).toBeInTheDocument();
    expect(client.listUsers).toHaveBeenLastCalledWith({ query: undefined, status: undefined, offset: 50, limit: 50 });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Page 1 · Showing 1-50")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search users"), "alex");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(client.listUsers).toHaveBeenLastCalledWith({ query: "alex", status: undefined, offset: 0, limit: 50 });
    await userEvent.selectOptions(screen.getByLabelText("Status"), "SUSPENDED");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(client.listUsers).toHaveBeenLastCalledWith({ query: "alex", status: "SUSPENDED", offset: 0, limit: 50 });
  });

  it("prevents an older page response from replacing a newer filtered request", async () => {
    const client = mockClient();
    const olderPage = deferred<IdentityUserSummary[]>();
    client.listUsers.mockImplementation((filters = {}) => {
      if (filters.query === "current") return Promise.resolve([{ ...userDetail().user, username: "current.user", displayName: "Current Result" }]);
      if (filters.offset === 50) return olderPage.promise;
      return Promise.resolve(pagedUsers(50, 0));
    });
    renderPage(client);
    await screen.findByText("Page 1 · Showing 1-50");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.type(screen.getByLabelText("Search users"), "current");
    fireEvent.submit(screen.getByRole("button", { name: "Apply" }).closest("form")!);
    expect(await screen.findByRole("button", { name: /Current Result/ })).toBeInTheDocument();
    olderPage.resolve([{ ...userDetail().user, username: "stale.user", displayName: "Stale Result" }]);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Stale Result/ })).not.toBeInTheDocument());
  });

  it("shows a failed later page as a directory failure instead of an empty result", async () => {
    const client = mockClient();
    client.listUsers.mockImplementation(async (filters = {}) => {
      if (filters.offset === 50) throw uiError("integration-unavailable", "The requested user page is temporarily unavailable.", true);
      return pagedUsers(50, 0);
    });
    renderPage(client);
    await screen.findByText("Page 1 · Showing 1-50");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("User directory: Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No users match the current search.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry User directory" })).toBeInTheDocument();
  });

  it("reopens an authoritative Elevated Access request after remount without activating access", async () => {
    const client = mockClient();
    client.getPrivilegedAccessRequest.mockResolvedValue(privilegedRequest("APPROVED"));
    const first = renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    await userEvent.type(screen.getByLabelText("Request reference"), "request-persisted");
    await userEvent.click(screen.getByRole("button", { name: "Load Request" }));
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(client.getPrivilegedAccessRequest).toHaveBeenLastCalledWith("request-persisted");
    expect(screen.queryByText("Active Authority")).not.toBeInTheDocument();
    first.unmount();

    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    await userEvent.type(screen.getByLabelText("Request reference"), "request-persisted");
    await userEvent.click(screen.getByRole("button", { name: "Load Request" }));
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    expect(client.getPrivilegedAccessRequest).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["not-found", "Elevated Access request: Not found"],
    ["permission-denied", "Elevated Access request: Access denied"],
    ["integration-unavailable", "Elevated Access request: Unavailable"]
  ] as const)("distinguishes %s Elevated Access lookup failures", async (kind, expected) => {
    const client = mockClient();
    client.getPrivilegedAccessRequest.mockRejectedValue(uiError(kind, "The request could not be loaded safely.", kind === "integration-unavailable"));
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    await userEvent.type(screen.getByLabelText("Request reference"), "request-unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Load Request" }));
    expect(await screen.findByText(expected)).toBeInTheDocument();
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
    for (const [kind, expected] of [["permission-denied", "User directory: Access denied"], ["not-found", "User directory: Not found"], ["conflict", "User directory: Current information changed"], ["integration-unavailable", "User directory: Unavailable"]] as const) {
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

async function selectInitialAccess(form: HTMLElement) {
  await userEvent.selectOptions(within(form).getByLabelText("User type"), "SITE_OPERATOR");
  await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "33333333-3333-4333-8333-333333333333");
  await userEvent.selectOptions(within(form).getByLabelText("Assigned Site"), "site-1");
}

function pagedUsers(count: number, start: number): IdentityUserSummary[] {
  return Array.from({ length: count }, (_, index) => ({ ...userDetail().user, userReference: `user-${start + index + 1}`, username: `user.${start + index + 1}`, displayName: `User ${start + index + 1}` }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function uiError(kind: string, message: string, retryable = false, mutationUncertain = false) {
  return { kind, code: "SAFE_H007_ERROR", message, retryable, mutationUncertain };
}

function mockClient() {
  const user = userDetail();
  return {
    listUsers: vi.fn(async (_filters: { query?: string; status?: string; offset?: number; limit?: number } = {}) => [user.user]), getUser: vi.fn(async (_reference: string) => user),
    createUser: vi.fn(async (_body: Record<string, unknown>) => user.user), updateUser: vi.fn(async (_reference: string, _body: Record<string, unknown>) => user.user), changeLifecycle: vi.fn(async () => user.user),
    listRoles: vi.fn(async () => [
      { roleReference: "33333333-3333-4333-8333-333333333333", code: "SITE_OPERATOR", name: "Site Operator", description: "Site access", type: "SYSTEM", status: "ACTIVE", isPrivileged: false, requiresElevatedApproval: false, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1 },
      { roleReference: "22222222-2222-4222-8222-222222222222", code: "SITE_OPERATOR", name: "Site Operator", description: "Site operations", type: "CUSTOM", status: "ACTIVE", isPrivileged: true, requiresElevatedApproval: true, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1 }
    ]),
    listPermissions: vi.fn(async () => [{ permissionReference: "permission-1", code: "user.view", name: "View users", domain: "Identity", action: "VIEW", status: "ACTIVE", isSensitive: false, requiresAudit: true, rowVersion: 1 }]),
    assignRole: vi.fn(async () => user.roleAssignments[0]), revokeRole: vi.fn(async () => user.roleAssignments[0]), grantScope: vi.fn(async () => user.scopeGrants[0]), revokeScope: vi.fn(async (_userReference: string, _assignmentReference: string, _grantReference: string, _body: Record<string, unknown>) => user.scopeGrants[0]),
    createPrivilegedAccessRequest: vi.fn(async () => privilegedRequest("REQUESTED")), getPrivilegedAccessRequest: vi.fn(async () => privilegedRequest("REQUESTED")), decidePrivilegedAccess: vi.fn(async () => privilegedRequest("APPROVED")), reviewAccess: vi.fn(async () => true),
    listSessions: vi.fn(async () => [{ sessionReference: "session-1", audience: "MANAGEMENT_PLATFORM", status: "ACTIVE", assurance: "PASSWORD_TOTP", mfaRequirementSatisfied: true, deviceServiceIdentityReference: null, authenticatedAt: "2030-01-01T00:00:00Z", lastSeenAt: "2030-01-01T00:10:00Z", idleExpiresAt: "2030-01-01T00:30:00Z", absoluteExpiresAt: "2030-01-01T08:00:00Z", revokedAt: null, rowVersion: 1 }]),
    revokeSession: vi.fn(async () => undefined), getMfaStatus: vi.fn(async () => ({ requiredForPrivilegedManagementPlatform: true, enrolled: true, status: "ACTIVE", enrollmentStartedAt: null, activatedAt: "2030-01-01T00:00:00Z", lastSuccessfullyUsedAt: "2030-01-01T00:00:00Z", resetAt: null, revokedAt: null, rowVersion: 1 })), changeMfa: vi.fn(async () => ({ requiredForPrivilegedManagementPlatform: true, enrolled: false, status: "RESET_REQUIRED", enrollmentStartedAt: null, activatedAt: null, lastSuccessfullyUsedAt: null, resetAt: "2030-01-01T00:00:00Z", revokedAt: null, rowVersion: 2 })),
    listAuditEvents: vi.fn(async () => [{ auditReference: "audit-1", eventType: "ROLE_ASSIGNED", result: "SUCCESS", reasonCode: "AUTHORIZED", actorUserReference: null, summary: "Role assignment recorded.", occurredAt: "2030-01-01T00:00:00Z", correlationReference: "support-ref-1" }])
  } satisfies { [K in keyof IdentityAdministrationClient]: ReturnType<typeof vi.fn> };
}

function role(code: string, name: string, reference: string) {
  return { roleReference: reference, code, name, description: "Governed role", type: "SYSTEM", status: "ACTIVE", isPrivileged: false, requiresElevatedApproval: false, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1 };
}

function userDetail(): IdentityUserDetail { return { user: { userReference: "11111111-1111-4111-8111-111111111111", username: "alex.rivera", displayName: "Alex Rivera", maskedEmail: "a***@example.test", maskedMobileNumber: "***1234", userType: "SITE_OPERATOR", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastLoginAt: "2030-01-01T00:00:00Z", rowVersion: 4 }, roleAssignments: [{ assignmentReference: "assignment-1", userReference: "11111111-1111-4111-8111-111111111111", roleReference: "22222222-2222-4222-8222-222222222222", roleCode: "SITE_OPERATOR", roleName: "Site Operator", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: null, rowVersion: 2 }], scopeGrants: [{ grantReference: "grant-1", assignmentReference: "assignment-1", scopeType: "SITE", siteReference: "site-1", siteGroupReference: null, status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: null, rowVersion: 2 }] }; }
function privilegedRequest(status: string) { return { requestReference: "request-1", targetUserReference: "user-1", requestedRoleReference: "role-1", requestedScopeType: null, requestedSiteReference: null, requestedSiteGroupReference: null, status, reasonCode: "AUTHORIZED", requestedEffectiveFrom: "2030-01-01T00:00:00Z", requestedEffectiveTo: null, requestedAt: "2030-01-01T00:00:00Z", requestedByUserReference: "admin-1", expiresAt: null, rowVersion: 1, decisions: [] }; }

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IdentityAdministrationPage } from "./IdentityAdministrationPage";
import { identityAdministrationPermissions, type IdentityAdministrationClient, type IdentityUserDetail, type IdentityUserSummary, type IdentityRoleDefinition, type IdentityMfaStatus } from "./identityAdministration";

describe("IdentityAdministrationPage", () => {
  it("renders a populated governed user list and coherent detail without raw identifiers", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Alex Rivera/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Alex Rivera/ }));
    expect(await screen.findByRole("heading", { name: "Alex Rivera" })).toBeInTheDocument();
    expect(screen.getByText(/alex\.rivera · Legacy classification: Site Operator/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account Status" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("renders the empty authorized result distinctly", async () => {
    const client = mockClient();
    client.listUsers.mockResolvedValue([]);
    renderPage(client);
    expect(await screen.findByText("No users match the current search.")).toBeInTheDocument();
  });

  it("displays the eight approved roles without a user-type gate", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    expect(within(form).queryByLabelText("User type")).not.toBeInTheDocument();
    expect(Array.from((within(form).getByLabelText("Initial role") as HTMLSelectElement).options).map((option) => option.text)).toEqual([
      "Select a role", "System Administrator", "Operations Supervisor", "Site Operator", "Parking Attendant", "APT / Cashier Operator", "Finance / Reconciliation Analyst", "Compliance / Policy Administrator", "Executive / Management"
    ]);
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-system");
    expect(within(form).getByRole("note", { name: "System Administrator access" })).toHaveTextContent("does not grant operational, cashier, statutory-discount approval, or business-workflow authority");
    expect(within(form).getByLabelText("Access level")).toHaveValue("GLOBAL");
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-compliance");
    expect(within(form).getByLabelText("Access level")).toHaveValue("GLOBAL");
  });

  it("offers backend direct-add roles even when privileged or marked for elevated approval", async () => {
    const client = mockClient();
    client.listRoles.mockResolvedValue([role("SYSTEM_ADMINISTRATOR", "System Administrator", "role-system", [], true)]);
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    expect(within(form).getByRole("option", { name: "System Administrator" })).toBeInTheDocument();
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-system");
    expect(within(form).getByLabelText("Access level")).toHaveValue("GLOBAL");
  });

  it("renders application and scope choices from authoritative backend role metadata", async () => {
    const client = mockClient();
    const serverRole = role("OPERATIONS_SUPERVISOR", "Operations Supervisor", "role-operations");
    serverRole.applicationAccess = ["APT"];
    serverRole.scopePolicy = { allowedScopeTypes: ["SITE_GROUP"], assignmentRequired: true, defaultScope: "SITE_GROUP" };
    client.listRoles.mockResolvedValue([serverRole]);
    renderPage(client);

    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-operations");

    expect(within(form).getByRole("note", { name: "Operations Supervisor access" })).toHaveTextContent("Applications from Central PMS: APT");
    expect(within(form).getByLabelText("Access level")).toHaveValue("SITE_GROUP");
    expect(within(form).getByLabelText("Access level")).toBeDisabled();
  });
  it("uses backend defaultScope even when it is not the first allowed scope", async () => {
    const client = mockClient();
    const serverRole = role("FINANCE_RECONCILIATION_ANALYST", "Finance / Reconciliation Analyst", "role-finance");
    serverRole.scopePolicy = { allowedScopeTypes: ["SITE", "GLOBAL"], assignmentRequired: true, defaultScope: "GLOBAL" };
    client.listRoles.mockResolvedValue([serverRole]);
    renderPage(client);

    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-finance");

    expect(within(form).getByLabelText("Access level")).toHaveValue("GLOBAL");
  });

  it("requires explicit scope selection when Finance defaultScope is null", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-finance");

    const accessLevel = within(form).getByLabelText("Access level");
    expect(accessLevel).toHaveValue("");
    expect(accessLevel).toBeEnabled();
    expect(within(form).queryByLabelText("Assigned Site")).not.toBeInTheDocument();
    await userEvent.selectOptions(accessLevel, "SITE");
    expect(within(form).getByLabelText("Assigned Site")).toBeInTheDocument();
  });

  it("does not offer a backend role that is ineligible for direct user creation", async () => {
    const client = mockClient();
    client.listRoles.mockResolvedValue([{ ...role("SITE_OPERATOR", "Site Operator", "role-site-operator"), directAddUserEligible: false }]);
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    expect(within(form).queryByRole("option", { name: "Site Operator" })).not.toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Add User" })).toBeDisabled();
  });
  it("makes Executive / Management explicitly Global-only", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.type(within(form).getByLabelText("Username"), "executive.user");
    await userEvent.type(within(form).getByLabelText("Display name"), "Executive User");
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_EXECUTIVE");
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-executive");
    const scope = within(form).getByLabelText("Access level");
    expect(scope).toHaveValue("GLOBAL");
    expect(scope).toBeDisabled();
    expect(within(scope).getAllByRole("option")).toHaveLength(1);
    await userEvent.click(within(form).getByRole("button", { name: "Add User" }));
    await waitFor(() => expect(client.createUser).toHaveBeenCalledOnce());
    expect(client.createUser.mock.calls[0][0]).toMatchObject({ initialRoleReference: "role-executive", initialScopeType: "GLOBAL", initialSiteReference: null, initialSiteGroupReference: null });
    expect(client.createUser.mock.calls[0][0]).not.toHaveProperty("userType");
  });

  it("shows provisioning material once, then returns to TOTP status only", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: "Add User" }));
    const form = screen.getByRole("heading", { name: "Add User" }).closest("form")!;
    await userEvent.type(within(form).getByLabelText("Username"), "new.operator");
    await userEvent.type(within(form).getByLabelText("Display name"), "New Operator");
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_PROVISIONING");
    await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-site-operator");
    await userEvent.selectOptions(within(form).getByLabelText("Assigned Site"), "site-1");
    await userEvent.click(within(form).getByRole("button", { name: "Add User" }));
    const provisioning = await screen.findByRole("region", { name: "Provision Alex Rivera" });
    expect(provisioning).toHaveTextContent("Temporary-Only-72h!");
    expect(provisioning).toHaveTextContent("JBSWY3DPEHPK3PXP");
    expect(await within(provisioning).findByAltText("Authenticator QR code for alex.rivera")).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(provisioning).toHaveTextContent("Account status: Active");
    expect(provisioning).toHaveTextContent("Normal application access remains blocked until the required password change is complete.");
    expect(provisioning).not.toHaveTextContent(/business functions.*ready|ready for use/i);
    expect(localStorage).toHaveLength(0);
    await userEvent.click(within(provisioning).getByRole("button", { name: "I have completed provisioning" }));
    expect(screen.queryByText("Temporary-Only-72h!")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("tab", { name: "Security" }));
    expect(await screen.findByText("Required for sign-in")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/JBSWY3DPEHPK3PXP|otpauth:/i);
  });
  it("limits scope mutations to the selected backend role policy", async () => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    const form = screen.getByRole("heading", { name: "Add Scope Access" }).closest("form")!;
    const scopeType = within(form).getByLabelText("Scope access level");
    expect(scopeType).toHaveValue("SITE");
    expect(scopeType).toBeDisabled();
    expect(within(scopeType).queryByRole("option", { name: "Site Group" })).not.toBeInTheDocument();
    await userEvent.selectOptions(within(form).getByLabelText("Site"), "site-1");
    await userEvent.type(within(form).getByLabelText("Reason"), "AUTHORIZED_SITE_ACCESS");
    await userEvent.click(within(form).getByRole("button", { name: "Add Access" }));

    expect(await screen.findByText("Access assignment added.")).toBeInTheDocument();
    expect(client.grantScope).toHaveBeenCalledWith(
      userDetail().user.userReference,
      "assignment-1",
      expect.objectContaining({ scopeType: "SITE", siteReference: "site-1", siteGroupReference: null })
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
    expect(screen.getByRole("button", { name: "Add Role" })).toBeDisabled();
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

  it.each([
    ["SYSTEM_ADMINISTRATOR", "role-system", "System Administrator (Global scope)"],
    ["OPERATIONS_SUPERVISOR", "role-operations", "Operations Supervisor"],
    ["COMPLIANCE_POLICY_ADMINISTRATOR", "role-compliance", "Compliance / Policy Administrator"],
    ["EXECUTIVE_MANAGEMENT", "role-executive", "Executive / Management (Global scope)"]
  ] as const)("directly assigns approved role %s without an elevated request", async (_code, reference, label) => {
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Roles & Permissions" }));
    const roleForm = screen.getByRole("heading", { name: "Add Role" }).closest("form")!;
    expect(within(roleForm).getByRole("option", { name: label })).toBeInTheDocument();
    expect(within(roleForm).queryByText(/elevated access approval/i)).not.toBeInTheDocument();
    await userEvent.selectOptions(within(roleForm).getByLabelText("Role"), reference);
    await userEvent.type(within(roleForm).getByLabelText("Reason"), "AUTHORIZED_ROLE_ASSIGNMENT");
    await userEvent.click(within(roleForm).getByRole("button", { name: "Add Role" }));
    await waitFor(() => expect(client.assignRole).toHaveBeenCalledWith(
      userDetail().user.userReference,
      expect.objectContaining({ roleReference: reference, reasonCode: "AUTHORIZED_ROLE_ASSIGNMENT" })
    ));
    expect(screen.queryByRole("heading", { name: "Elevated Access" })).not.toBeInTheDocument();
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
    expect(within(screen.getByLabelText("Scope access level")).queryByRole("option", { name: /global/i })).not.toBeInTheDocument();
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

  it("shows MFA and sessions without secrets and uses deliberate revoke confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Security" }));
    expect(screen.getByRole("heading", { name: "Two-Factor Authentication" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active Sessions" })).toBeInTheDocument();
    expect(await screen.findByText("Required for sign-in")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/totp-secret-value|session-secret-value|otpauth:\/\//i);
    await userEvent.click(screen.getByRole("button", { name: "Sign Out Session" }));
    await waitFor(() => expect(client.revokeSession).toHaveBeenCalledOnce());
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("resets an active authenticator and destroys one-time provisioning material when closed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Security" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset Authenticator App" }));

    const panel = await screen.findByRole("region", { name: "Set up authenticator" });
    expect(panel).toHaveTextContent("Alex Rivera");
    expect(panel).toHaveTextContent("alex.rivera");
    expect(panel).toHaveTextContent("KRSXG5DSNFXGOIDB");
    expect(panel).toHaveTextContent("This information is shown only once.");
    expect(await within(panel).findByAltText("Authenticator QR code for alex.rivera")).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml/));
    expect(client.resetMfa).toHaveBeenCalledWith(userDetail().user.userReference, { expectedRowVersion: 1, reasonCode: "GOVERNED_MFA_RESET" });

    await userEvent.click(within(panel).getByRole("button", { name: "I have completed provisioning" }));
    expect(screen.queryByText("KRSXG5DSNFXGOIDB")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Authenticator QR code for alex.rivera")).not.toBeInTheDocument();
    await waitFor(() => expect(client.getMfaStatus).toHaveBeenCalledTimes(2));
    confirm.mockRestore();
  });

  it("offers setup for a missing authenticator and remove never displays provisioning material", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = mockClient();
    client.getMfaStatus.mockResolvedValue({ ...mfaStatus(), enrolled: false, status: "REVOKED", activatedAt: null, revokedAt: "2030-01-01T00:00:00Z", rowVersion: 4 });
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Security" }));
    expect(await screen.findByText("Not set up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up Authenticator App" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset Authenticator App" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Authenticator App" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Set Up Authenticator App" }));
    expect(await screen.findByText("KRSXG5DSNFXGOIDB")).toBeInTheDocument();
    expect(client.setupMfa).toHaveBeenCalledWith(userDetail().user.userReference, { expectedRowVersion: 4, reasonCode: "GOVERNED_MFA_SETUP" });
    confirm.mockRestore();
  });

  it("removes an active authenticator without exposing a secret or QR", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const client = mockClient();
    renderPage(client);
    await userEvent.click(await screen.findByRole("button", { name: /Alex Rivera/ }));
    await userEvent.click(await screen.findByRole("tab", { name: "Security" }));
    await userEvent.click(await screen.findByRole("button", { name: "Remove Authenticator App" }));

    await waitFor(() => expect(client.removeMfa).toHaveBeenCalledOnce());
    expect(await screen.findByText("Not set up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up Authenticator App" })).toBeInTheDocument();
    expect(screen.queryByText("KRSXG5DSNFXGOIDB")).not.toBeInTheDocument();
    expect(screen.queryByAltText(/Authenticator QR code/)).not.toBeInTheDocument();
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
  return render(<IdentityAdministrationPage client={client} permissions={Object.values(identityAdministrationPermissions)} />);
}

async function selectInitialAccess(form: HTMLElement) {
  await userEvent.selectOptions(within(form).getByLabelText("Initial role"), "role-site-operator");
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
    createUser: vi.fn(async (_body: Record<string, unknown>) => ({ user: user.user, provisioning: provisioningMaterial() })), updateUser: vi.fn(async (_reference: string, _body: Record<string, unknown>) => user.user), changeLifecycle: vi.fn(async () => user.user),
    listRoles: vi.fn(async () => [
      role("SYSTEM_ADMINISTRATOR", "System Administrator", "role-system", [], true),
      role("OPERATIONS_SUPERVISOR", "Operations Supervisor", "role-operations"),
      role("SITE_OPERATOR", "Site Operator", "role-site-operator"),
      role("PARKING_ATTENDANT", "Parking Attendant", "role-attendant"),
      role("APT_CASHIER_OPERATOR", "APT / Cashier Operator", "role-apt"),
      role("FINANCE_RECONCILIATION_ANALYST", "Finance / Reconciliation Analyst", "role-finance"),
      role("COMPLIANCE_POLICY_ADMINISTRATOR", "Compliance / Policy Administrator", "role-compliance"),
      role("EXECUTIVE_MANAGEMENT", "Executive / Management", "role-executive")
    ]),
    listPermissions: vi.fn(async () => [{ permissionReference: "permission-1", code: "user.view", name: "View users", domain: "Identity", action: "VIEW", status: "ACTIVE", isSensitive: false, requiresAudit: true, rowVersion: 1 }]),
    getDelegableScopes: vi.fn(async () => ({
      siteGroups: [{ siteGroupId: "group-1", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null }],
      sites: [{ siteId: "site-1", siteCode: "PITX-L3", siteName: "PITX Level 3", siteGroupId: "group-1", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null }]
    })),
    assignRole: vi.fn(async () => user.roleAssignments[0]), revokeRole: vi.fn(async () => user.roleAssignments[0]), grantScope: vi.fn(async () => user.scopeGrants[0]), revokeScope: vi.fn(async (_userReference: string, _assignmentReference: string, _grantReference: string, _body: Record<string, unknown>) => user.scopeGrants[0]),
    reviewAccess: vi.fn(async () => true),
    listSessions: vi.fn(async () => [{ sessionReference: "session-1", audience: "MANAGEMENT_PLATFORM", status: "ACTIVE", assurance: "PASSWORD_TOTP", mfaRequirementSatisfied: true, deviceServiceIdentityReference: null, authenticatedAt: "2030-01-01T00:00:00Z", lastSeenAt: "2030-01-01T00:10:00Z", idleExpiresAt: "2030-01-01T00:30:00Z", absoluteExpiresAt: "2030-01-01T08:00:00Z", revokedAt: null, rowVersion: 1 }]),
    revokeSession: vi.fn(async () => undefined), getMfaStatus: vi.fn(async () => mfaStatus()),
    setupMfa: vi.fn(async () => mfaProvisioning()),
    resetMfa: vi.fn(async () => mfaProvisioning()),
    removeMfa: vi.fn(async () => ({ ...mfaStatus(), enrolled: false, status: "REVOKED", activatedAt: null, revokedAt: "2030-01-01T01:00:00Z", rowVersion: 2 })),
    listAuditEvents: vi.fn(async () => [{ auditReference: "audit-1", eventType: "ROLE_ASSIGNED", result: "SUCCESS", reasonCode: "AUTHORIZED", actorUserReference: null, summary: "Role assignment recorded.", occurredAt: "2030-01-01T00:00:00Z", correlationReference: "support-ref-1" }])
  } satisfies { [K in keyof IdentityAdministrationClient]: ReturnType<typeof vi.fn> };
}

function role(code: string, name: string, reference: string, allowedUserTypes: string[] = [], privileged = false): IdentityRoleDefinition {
  const siteScoped = ["OPERATIONS_SUPERVISOR", "SITE_OPERATOR", "PARKING_ATTENDANT", "APT_CASHIER_OPERATOR"].includes(code);
  const applicationAccess: IdentityRoleDefinition["applicationAccess"] = code === "OPERATIONS_SUPERVISOR" ? ["OPERATOR_CONSOLE", "MANAGEMENT_PLATFORM"] : code === "SITE_OPERATOR" ? ["OPERATOR_CONSOLE"] : code === "PARKING_ATTENDANT" ? ["NATIVE_PARKING_APP"] : code === "APT_CASHIER_OPERATOR" ? ["APT"] : ["MANAGEMENT_PLATFORM"];
  const scopePolicy: IdentityRoleDefinition["scopePolicy"] = ["SYSTEM_ADMINISTRATOR", "EXECUTIVE_MANAGEMENT"].includes(code)
    ? { allowedScopeTypes: ["GLOBAL"], assignmentRequired: true, defaultScope: "GLOBAL" }
    : siteScoped
      ? { allowedScopeTypes: ["SITE"], assignmentRequired: true, defaultScope: "SITE" }
      : { allowedScopeTypes: ["SITE", "SITE_GROUP", "GLOBAL"], assignmentRequired: true, defaultScope: code === "FINANCE_RECONCILIATION_ANALYST" ? null : "GLOBAL" };
  return { roleReference: reference, code, name, description: "Governed role", type: "SYSTEM", status: "ACTIVE", isPrivileged: privileged, requiresElevatedApproval: false, effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, rowVersion: 1, provenance: "CANONICAL_ROLE", directAddUserEligible: true, humanAssignable: true, allowedUserTypes, applicationAccess, scopePolicy };
}
function provisioningMaterial() { return { temporaryPassword: "Temporary-Only-72h!", temporaryPasswordExpiresAt: "2030-01-04T00:00:00Z", totpSecret: "JBSWY3DPEHPK3PXP", totpProvisioningUri: "otpauth://totp/ExitPass:new.operator?secret=JBSWY3DPEHPK3PXP&issuer=ExitPass", displayOnce: true as const, passwordChangeRequired: true as const }; }
function mfaStatus(): IdentityMfaStatus { return { requiredForPrivilegedManagementPlatform: true, enrolled: true, status: "ACTIVE", enrollmentStartedAt: null, activatedAt: "2030-01-01T00:00:00Z", lastSuccessfullyUsedAt: "2030-01-01T00:00:00Z", resetAt: null, revokedAt: null, rowVersion: 1 }; }
function mfaProvisioning() { return { mfaStatus: { ...mfaStatus(), rowVersion: 2 }, provisioning: { totpSharedSecret: "KRSXG5DSNFXGOIDB", totpProvisioningUri: "otpauth://totp/ExitPass:alex.rivera?secret=KRSXG5DSNFXGOIDB&issuer=ExitPass", displayOnce: true as const } }; }

function userDetail(): IdentityUserDetail { return { user: { userReference: "11111111-1111-4111-8111-111111111111", username: "alex.rivera", displayName: "Alex Rivera", maskedEmail: "a***@example.test", maskedMobileNumber: "***1234", userType: "SITE_OPERATOR", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastLoginAt: "2030-01-01T00:00:00Z", rowVersion: 4 }, roleAssignments: [{ assignmentReference: "assignment-1", userReference: "11111111-1111-4111-8111-111111111111", roleReference: "role-site-operator", roleCode: "SITE_OPERATOR", roleName: "Site Operator", status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: null, rowVersion: 2 }], scopeGrants: [{ grantReference: "grant-1", assignmentReference: "assignment-1", scopeType: "SITE", siteReference: "site-1", siteGroupReference: null, status: "ACTIVE", effectiveFrom: "2030-01-01T00:00:00Z", effectiveTo: null, lastReviewedAt: null, rowVersion: 2 }] }; }

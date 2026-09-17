import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanAuthenticationShell } from "./HumanAuthenticationShell";
import { HumanAuthenticationError, managementPlatformAudience, type HumanAuthenticationClient, type HumanAuthenticationResponse, type HumanSessionDto } from "./humanAuthentication";
import { identityAdministrationPermissions } from "./identityAdministration";
import { managementPlatformOverviewPermission } from "./permissions";

describe("Management Platform I-020 session shell", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requires username, password, and TOTP for Management Platform login", async () => {
    const client = mockClient();
    const authenticated = successResponse(session({ assurance: "PASSWORD_TOTP", mfaRequired: true, mfaSatisfied: true }));
    client.getCurrentSession.mockRejectedValueOnce(sessionEnded()).mockResolvedValueOnce(authenticated);
    client.login.mockResolvedValue(authenticated);
    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByLabelText("Authenticator code")).toBeRequired();
    await fillLogin("ordinary.user", "ordinary-password", "123456");
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(client.login).toHaveBeenCalledWith("ordinary.user", "ordinary-password", "123456");
  });

  it("routes a forced password change and always submits TOTP", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValueOnce(successResponse(session({ passwordChangeRequired: true, mfaRequired: true, mfaSatisfied: true })));
    client.changeFirstPassword.mockResolvedValue({ ...successResponse(), outcome: "PASSWORD_CHANGED", authenticated: false, session: null });
    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("heading", { name: "Change temporary password" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Temporary or current password"), "temporary-password");
    await userEvent.type(screen.getByLabelText("Authenticator code"), "123456");
    await userEvent.type(screen.getByLabelText("New password"), "new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(client.changeFirstPassword).toHaveBeenCalledWith({ currentPassword: "temporary-password", totpCode: "123456", newPassword: "new-password" });
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("supports active and expired-temporary password reset without email or SMS", async () => {
    const client = mockClient();
    client.getCurrentSession.mockRejectedValueOnce(sessionEnded());
    client.resetPassword.mockResolvedValue({ ...successResponse(), outcome: "PASSWORD_RESET_COMPLETED", authenticated: false, session: null });
    client.login.mockResolvedValue(successResponse());
    const { unmount } = render(<HumanAuthenticationShell client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Forgot password" }));
    await userEvent.type(screen.getByLabelText("Username"), "active.user");
    await userEvent.type(screen.getByLabelText("Authenticator code"), "654321");
    await userEvent.type(screen.getByLabelText("New password"), "active-new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(client.resetPassword).toHaveBeenCalledWith({ username: "active.user", totpCode: "654321", newPassword: "active-new-password" });
    expect(document.body.textContent).not.toMatch(/email|sms/i);
    unmount();

    const expiredClient = mockClient();
    expiredClient.getCurrentSession.mockRejectedValueOnce(sessionEnded());
    expiredClient.resetExpiredTemporaryPassword.mockResolvedValue({ ...successResponse(), outcome: "PASSWORD_RESET_COMPLETED", authenticated: false, session: null });
    render(<HumanAuthenticationShell client={expiredClient} />);
    await userEvent.click(await screen.findByRole("button", { name: "Forgot password" }));
    await userEvent.click(screen.getByRole("button", { name: "My temporary password expired" }));
    await userEvent.type(screen.getByLabelText("Username"), "expired.user");
    await userEvent.type(screen.getByLabelText("Expired temporary password"), "expired-temporary");
    await userEvent.type(screen.getByLabelText("Authenticator code"), "987654");
    await userEvent.type(screen.getByLabelText("New password"), "expired-new-password");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(expiredClient.resetExpiredTemporaryPassword).toHaveBeenCalledWith({ username: "expired.user", expiredTemporaryPassword: "expired-temporary", totpCode: "987654", newPassword: "expired-new-password" });
  });
  it("rediscoveries an existing server session without browser authority", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse());
    const localStorageSet = vi.spyOn(Storage.prototype, "setItem");

    const { unmount } = render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    unmount();
    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();

    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
    expect(localStorageSet).not.toHaveBeenCalled();
    localStorageSet.mockRestore();
  });

  it("refreshes the displayed idle expiry from current-session readback after authenticated API activity", async () => {
    const client = mockClient();
    const initial = successResponse(session({
      permissions: [identityAdministrationPermissions.userView],
      idleExpiresAt: "2099-01-01T00:30:00Z",
      absoluteExpiresAt: "2099-01-01T08:00:00Z"
    }));
    const extended = successResponse(session({
      permissions: [identityAdministrationPermissions.userView],
      lastSeenAt: "2099-01-01T00:16:00Z",
      idleExpiresAt: "2099-01-01T00:46:00Z",
      absoluteExpiresAt: "2099-01-01T08:00:00Z"
    }));
    let resolveRefresh!: (value: HumanAuthenticationResponse) => void;
    client.getCurrentSession
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));

    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("heading", { name: "User Administration" })).toBeInTheDocument();
    const initialExpiry = screen.getByText(/Session expires/).textContent;
    await waitFor(() => expect(client.getCurrentSession).toHaveBeenCalledTimes(2));
    resolveRefresh(extended);
    await waitFor(() => expect(screen.getByText(/Session expires/).textContent).not.toBe(initialExpiry));
  });

  it("waits for server logout, clears runtime state, and returns to login", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse());
    client.logout.mockResolvedValue(undefined);

    render(<HumanAuthenticationShell client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(client.logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("signed out");
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("does not claim logout when the server cannot confirm revocation", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse());
    client.logout.mockRejectedValue(new HumanAuthenticationError("unavailable", "HUMAN_AUTHENTICATION_UNAVAILABLE", "Unavailable", 503, true));

    render(<HumanAuthenticationShell client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByText(/Sign out could not be confirmed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("keeps sessions without satisfied TOTP out of the workspace without offering enrollment", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse(session({ mfaRequired: true, mfaSatisfied: false, permissions: [] })));

    render(<HumanAuthenticationShell client={client} />);

    expect(await screen.findByRole("heading", { name: "Workspace access is restricted" })).toBeInTheDocument();
    expect(screen.getByText(/authorized administrator/)).toBeInTheDocument();
    expect(screen.queryByText(/set up an authenticator/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("handles unavailable and malformed startup responses without exposing protected content", async () => {
    const client = mockClient();
    client.getCurrentSession
      .mockRejectedValueOnce(new HumanAuthenticationError("malformed-response", "HUMAN_AUTHENTICATION_MALFORMED_RESPONSE", "The authentication response could not be read safely."))
      .mockRejectedValueOnce(sessionEnded());

    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("alert", { name: "Sign-in service unavailable" })).toHaveTextContent("could not be read safely");
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("provides keyboard focus for username and TOTP without persisting OTP input", async () => {
    const client = mockClient();
    client.getCurrentSession.mockRejectedValueOnce(sessionEnded());
    client.login.mockRejectedValue(new HumanAuthenticationError("invalid-totp", "TOTP_INVALID", "Verification required", 401));
    const storageSet = vi.spyOn(Storage.prototype, "setItem");

    render(<HumanAuthenticationShell client={client} />);
    const username = await screen.findByLabelText("Username");
    await waitFor(() => expect(username).toHaveFocus());
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
    await fillLogin("privileged.admin", "password", "123456");
    expect(screen.getByLabelText("Authenticator code")).toHaveValue("");
    expect(storageSet).not.toHaveBeenCalled();
    storageSet.mockRestore();
  });
});

type MockedClient = {
  [Key in keyof HumanAuthenticationClient]: ReturnType<typeof vi.fn>;
};

function mockClient(): MockedClient {
  return {
    login: vi.fn<HumanAuthenticationClient["login"]>(),
    changeFirstPassword: vi.fn<HumanAuthenticationClient["changeFirstPassword"]>(),
    resetPassword: vi.fn<HumanAuthenticationClient["resetPassword"]>(),
    resetExpiredTemporaryPassword: vi.fn<HumanAuthenticationClient["resetExpiredTemporaryPassword"]>(),
    getCurrentSession: vi.fn<HumanAuthenticationClient["getCurrentSession"]>(),
    continueSession: vi.fn<HumanAuthenticationClient["continueSession"]>(),
    logout: vi.fn<HumanAuthenticationClient["logout"]>(),
    clearRuntimeState: vi.fn<HumanAuthenticationClient["clearRuntimeState"]>(),
    hasCsrfToken: vi.fn<HumanAuthenticationClient["hasCsrfToken"]>(() => true),
    authorizeUnsafeRequest: vi.fn<HumanAuthenticationClient["authorizeUnsafeRequest"]>()
  };
}

async function fillLogin(username: string, password: string, totpCode: string) {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.type(screen.getByLabelText("Authenticator code"), totpCode);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

function sessionEnded() {
  return new HumanAuthenticationError("authentication-required", "SESSION_INVALID", "Sign in to continue.", 401);
}

function session(overrides: Partial<HumanSessionDto> = {}): HumanSessionDto {
  return {
    sessionReference: "10000000-0000-0000-0000-000000000001",
    userReference: "10000000-0000-0000-0000-000000000002",
    username: "ordinary.user",
    displayName: "Ordinary Management User",
    audience: managementPlatformAudience,
    assurance: "PASSWORD_TOTP",
    privilegedAccount: false,
    passwordChangeRequired: false,
    mfaRequired: true,
    mfaSatisfied: true,
    authenticatedAt: "2030-01-01T00:00:00Z",
    lastSeenAt: "2030-01-01T00:00:00Z",
    idleExpiresAt: "2030-01-01T00:30:00Z",
    absoluteExpiresAt: "2030-01-01T08:00:00Z",
    permissions: [managementPlatformOverviewPermission, "dashboard.view", "reports.view"],
    siteReferences: ["71000000-0000-0000-0000-000000000101"],
    siteGroupReferences: ["71000000-0000-0000-0000-000000000900"],
    hasGlobalScope: false,
    deviceServiceIdentityReference: null,
    correlationId: "10000000-0000-0000-0000-000000000003",
    ...overrides
  };
}

function successResponse(sessionValue: HumanSessionDto = session()): HumanAuthenticationResponse {
  return {
    outcome: "AUTHENTICATED",
    authenticated: true,
    session: sessionValue,
    aptSessionToken: null,
    errorCode: null,
    retryable: false,
    correlationId: "10000000-0000-0000-0000-000000000003"
  };
}

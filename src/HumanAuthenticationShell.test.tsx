import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HumanAuthenticationShell } from "./HumanAuthenticationShell";
import { HumanAuthenticationError, managementPlatformAudience, type HumanAuthenticationClient, type HumanAuthenticationResponse, type HumanSessionDto } from "./humanAuthentication";
import { managementPlatformOverviewPermission } from "./permissions";

describe("Management Platform I-020 session shell", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts unauthenticated, completes ordinary password login without TOTP, then reads the current session", async () => {
    const client = mockClient();
    client.getCurrentSession
      .mockRejectedValueOnce(sessionEnded())
      .mockResolvedValueOnce(successResponse());
    client.login.mockResolvedValue(successResponse());

    render(<HumanAuthenticationShell client={client} />);
    await fillLogin("ordinary.user", "ordinary-password");

    expect(await screen.findByRole("heading", { name: "Management Platform foundation" })).toBeInTheDocument();
    expect(client.login).toHaveBeenCalledWith("ordinary.user", "ordinary-password", undefined);
    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument();
    expect(screen.getByText("Ordinary Management User")).toBeInTheDocument();
    expect(screen.getAllByText(/1 Site scope; 1 Site Group scope/)).toHaveLength(2);
  });

  it("shows TOTP only after the server requires it and accepts a privileged TOTP login", async () => {
    const client = mockClient();
    const privileged = successResponse(session({
      username: "privileged.admin",
      displayName: "Privileged Administrator",
      privilegedAccount: true,
      mfaRequired: true,
      mfaSatisfied: true,
      assurance: "PASSWORD_TOTP"
    }));
    client.getCurrentSession.mockRejectedValueOnce(sessionEnded()).mockResolvedValueOnce(privileged);
    client.login
      .mockRejectedValueOnce(new HumanAuthenticationError("mfa-required", "TOTP_REQUIRED", "Enter the verification code from your authenticator app.", 401))
      .mockResolvedValueOnce(privileged);

    render(<HumanAuthenticationShell client={client} />);
    await fillLogin("privileged.admin", "privileged-password");

    const totp = await screen.findByLabelText("Verification code");
    expect(totp).toHaveFocus();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    await userEvent.type(totp, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

    expect(await screen.findByText("Privileged Administrator")).toBeInTheDocument();
    expect(client.login).toHaveBeenNthCalledWith(2, "privileged.admin", "privileged-password", "123456");
  });

  it("keeps invalid credentials and invalid TOTP anti-enumerating and controlled", async () => {
    const client = mockClient();
    client.getCurrentSession.mockRejectedValueOnce(sessionEnded());
    client.login.mockRejectedValueOnce(new HumanAuthenticationError("invalid-credentials", "INVALID_CREDENTIALS", "The username or password was not accepted.", 401));

    const { unmount } = render(<HumanAuthenticationShell client={client} />);
    await fillLogin("unknown.user", "wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("username or password was not accepted");
    expect(document.body).not.toHaveTextContent(/user does not exist|database|stack trace/i);
    unmount();

    const totpClient = mockClient();
    totpClient.getCurrentSession.mockRejectedValueOnce(sessionEnded());
    totpClient.login
      .mockRejectedValueOnce(new HumanAuthenticationError("mfa-required", "TOTP_REQUIRED", "Verification required", 401))
      .mockRejectedValueOnce(new HumanAuthenticationError("invalid-totp", "TOTP_INVALID", "The verification code was not accepted. Try again.", 401));
    render(<HumanAuthenticationShell client={totpClient} />);
    await fillLogin("privileged.admin", "password");
    await userEvent.type(await screen.findByLabelText("Verification code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("verification code was not accepted");
    expect(screen.getByLabelText("Verification code")).toHaveValue("");
  });

  it("rediscoveries an existing server session without browser authority", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse());
    const localStorageSet = vi.spyOn(Storage.prototype, "setItem");

    const { unmount } = render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("heading", { name: "Management Platform foundation" })).toBeInTheDocument();
    unmount();
    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("heading", { name: "Management Platform foundation" })).toBeInTheDocument();

    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
    expect(localStorageSet).not.toHaveBeenCalled();
    localStorageSet.mockRestore();
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
    expect(screen.queryByRole("heading", { name: "Management Platform foundation" })).not.toBeInTheDocument();
  });

  it("does not claim logout when the server cannot confirm revocation", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse());
    client.logout.mockRejectedValue(new HumanAuthenticationError("unavailable", "HUMAN_AUTHENTICATION_UNAVAILABLE", "Unavailable", 503, true));

    render(<HumanAuthenticationShell client={client} />);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out could not be confirmed");
    expect(screen.getByRole("heading", { name: "Management Platform foundation" })).toBeInTheDocument();
  });

  it("keeps a restricted server session out of the workspace", async () => {
    const client = mockClient();
    client.getCurrentSession.mockResolvedValue(successResponse(session({ privilegedAccount: true, mfaRequired: true, mfaSatisfied: false, permissions: [], siteReferences: [], siteGroupReferences: [] })));

    render(<HumanAuthenticationShell client={client} />);

    expect(await screen.findByRole("heading", { name: "Workspace access is restricted" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Management Platform foundation" })).not.toBeInTheDocument();
  });

  it("handles unavailable and malformed startup responses without exposing protected content", async () => {
    const client = mockClient();
    client.getCurrentSession
      .mockRejectedValueOnce(new HumanAuthenticationError("malformed-response", "HUMAN_AUTHENTICATION_MALFORMED_RESPONSE", "The authentication response could not be read safely."))
      .mockRejectedValueOnce(sessionEnded());

    render(<HumanAuthenticationShell client={client} />);
    expect(await screen.findByRole("alert", { name: "Sign-in service unavailable" })).toHaveTextContent("could not be read safely");
    expect(screen.queryByRole("heading", { name: "Management Platform foundation" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("provides keyboard focus for username and TOTP without persisting OTP input", async () => {
    const client = mockClient();
    client.getCurrentSession.mockRejectedValueOnce(sessionEnded());
    client.login.mockRejectedValue(new HumanAuthenticationError("mfa-required", "TOTP_REQUIRED", "Verification required", 401));
    const storageSet = vi.spyOn(Storage.prototype, "setItem");

    render(<HumanAuthenticationShell client={client} />);
    const username = await screen.findByLabelText("Username");
    expect(username).toHaveFocus();
    await fillLogin("privileged.admin", "password");
    expect(await screen.findByLabelText("Verification code")).toHaveFocus();
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
    getCurrentSession: vi.fn<HumanAuthenticationClient["getCurrentSession"]>(),
    continueSession: vi.fn<HumanAuthenticationClient["continueSession"]>(),
    logout: vi.fn<HumanAuthenticationClient["logout"]>(),
    clearRuntimeState: vi.fn<HumanAuthenticationClient["clearRuntimeState"]>(),
    hasCsrfToken: vi.fn<HumanAuthenticationClient["hasCsrfToken"]>(() => true)
  };
}

async function fillLogin(username: string, password: string) {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
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
    assurance: "PASSWORD",
    privilegedAccount: false,
    passwordChangeRequired: false,
    mfaRequired: false,
    mfaSatisfied: false,
    authenticatedAt: "2030-01-01T00:00:00Z",
    lastSeenAt: "2030-01-01T00:00:00Z",
    idleExpiresAt: "2030-01-01T00:30:00Z",
    absoluteExpiresAt: "2030-01-01T08:00:00Z",
    permissions: [managementPlatformOverviewPermission],
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

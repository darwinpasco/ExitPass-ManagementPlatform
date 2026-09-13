import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MfaEnrollmentPage } from "./MfaEnrollmentPage";
import { MfaEnrollmentError, type MfaEnrollmentClient, type TotpEnrollmentResponse } from "./mfaEnrollment";
import type { HumanAuthenticationClient, HumanSessionDto } from "./humanAuthentication";

describe("W4.4 privileged authenticator enrollment page", () => {
  it("shows server-issued QR and manual secret only in memory, confirms, logs out, and requires sign-in", async () => {
    const auth = authenticationClient();
    const enrollment = enrollmentClient();
    const onSignIn = vi.fn();
    render(<MfaEnrollmentPage session={restrictedSession()} authenticationClient={auth} enrollmentClient={enrollment} onSignIn={onSignIn} />);

    expect(screen.getByText(/Privileged permissions and site access remain unavailable/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Set up authenticator" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));

    expect(await screen.findByLabelText("Authenticator setup QR code")).toBeVisible();
    expect(screen.getByLabelText("Manual setup secret")).toHaveTextContent("SERVERSETUPSECRET");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    await userEvent.type(screen.getByLabelText("Authenticator code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirm authenticator" }));
    expect(await screen.findByRole("heading", { name: "Authenticator setup complete" })).toBeVisible();
    expect(screen.queryByText("SERVERSETUPSECRET")).not.toBeInTheDocument();
    expect(enrollment.confirm).toHaveBeenCalledWith("123456");
    expect(auth.logout).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledWith("Authenticator setup is complete. Sign in again.");
  });

  it("requires explicit restart when a pending secret was lost and returns only new material", async () => {
    const auth = authenticationClient();
    const enrollment = enrollmentClient({
      begin: vi.fn().mockRejectedValue(new MfaEnrollmentError("pending-exists", "TOTP_AUTHENTICATOR_ALREADY_EXISTS", "Setup already started.")),
      restart: vi.fn().mockResolvedValue(enrollmentResponse("TOTP_ENROLLMENT_RESTARTED", "REPLACEMENTSECRET"))
    });
    render(<MfaEnrollmentPage session={restrictedSession()} authenticationClient={auth} enrollmentClient={enrollment} onSignIn={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    expect(await screen.findByText(/previous one-time setup secret cannot be shown again/i)).toBeVisible();
    expect(enrollment.restart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Restart authenticator setup" }));
    expect(await screen.findByLabelText("Manual setup secret")).toHaveTextContent("REPLACEMENTSECRET");
    expect(enrollment.restart).toHaveBeenCalledOnce();
  });

  it("keeps invalid and throttled confirmation controlled without persisting the code", async () => {
    const auth = authenticationClient();
    const enrollment = enrollmentClient({
      confirm: vi.fn()
        .mockRejectedValueOnce(new MfaEnrollmentError("invalid-code", "TOTP_CONFIRMATION_FAILED", "The code was not accepted."))
        .mockRejectedValueOnce(new MfaEnrollmentError("throttled", "TOTP_THROTTLED", "Wait and try again.", true))
    });
    render(<MfaEnrollmentPage session={restrictedSession()} authenticationClient={auth} enrollmentClient={enrollment} onSignIn={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    await screen.findByLabelText("Manual setup secret");

    await userEvent.type(screen.getByLabelText("Authenticator code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Confirm authenticator" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not accepted");
    expect(screen.getByLabelText("Authenticator code")).toHaveValue("");
    expect(screen.getByLabelText("Manual setup secret")).toHaveTextContent("SERVERSETUPSECRET");

    await userEvent.type(screen.getByLabelText("Authenticator code"), "000001");
    fireEvent.submit(screen.getByLabelText("Authenticator code").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Wait and try again");
    expect(screen.getByLabelText("Authenticator code")).toHaveValue("");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("clears one-time material and signs out when setup is cancelled", async () => {
    const auth = authenticationClient();
    const onSignIn = vi.fn();
    render(<MfaEnrollmentPage session={restrictedSession()} authenticationClient={auth} enrollmentClient={enrollmentClient()} onSignIn={onSignIn} />);
    await userEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
    await screen.findByText("SERVERSETUPSECRET");
    await userEvent.click(screen.getByRole("button", { name: "Cancel and sign out" }));

    expect(auth.logout).toHaveBeenCalledOnce();
    expect(onSignIn).toHaveBeenCalled();
    expect(screen.queryByText("SERVERSETUPSECRET")).not.toBeInTheDocument();
  });
});

function restrictedSession(): HumanSessionDto {
  return {
    sessionReference: "10000000-0000-0000-0000-000000000001",
    userReference: "10000000-0000-0000-0000-000000000002",
    username: "privileged.admin",
    displayName: "Privileged Administrator",
    audience: "MANAGEMENT_PLATFORM",
    privilegedAccount: true,
    passwordChangeRequired: false,
    mfaRequired: true,
    mfaSatisfied: false,
    assurance: "PASSWORD_MFA_PENDING",
    authenticatedAt: "2030-01-01T00:00:00Z",
    lastSeenAt: "2030-01-01T00:00:00Z",
    idleExpiresAt: "2030-01-01T00:30:00Z",
    absoluteExpiresAt: "2030-01-01T08:00:00Z",
    permissions: [],
    siteReferences: [],
    siteGroupReferences: [],
    hasGlobalScope: false,
    deviceServiceIdentityReference: null,
    correlationId: "10000000-0000-0000-0000-000000000003"
  };
}

type MockedAuthenticationClient = {
  [Key in keyof HumanAuthenticationClient]: ReturnType<typeof vi.fn>;
};

type MockedEnrollmentClient = {
  [Key in keyof MfaEnrollmentClient]: ReturnType<typeof vi.fn>;
};

function authenticationClient(): MockedAuthenticationClient {
  return {
    login: vi.fn(),
    getCurrentSession: vi.fn(),
    continueSession: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    clearRuntimeState: vi.fn(),
    hasCsrfToken: vi.fn(() => true),
    authorizeUnsafeRequest: vi.fn()
  };
}

function enrollmentClient(overrides: Partial<MockedEnrollmentClient> = {}): MockedEnrollmentClient {
  return {
    begin: vi.fn().mockResolvedValue(enrollmentResponse("TOTP_ENROLLMENT_STARTED")),
    restart: vi.fn().mockResolvedValue(enrollmentResponse("TOTP_ENROLLMENT_RESTARTED", "REPLACEMENTSECRET")),
    confirm: vi.fn().mockResolvedValue({ ...enrollmentResponse("TOTP_CONFIRMED_REAUTHENTICATION_REQUIRED"), sharedSecret: null, provisioningUri: null }),
    ...overrides
  };
}

function enrollmentResponse(outcome: string, sharedSecret = "SERVERSETUPSECRET"): TotpEnrollmentResponse {
  return {
    outcome,
    sharedSecret,
    provisioningUri: `otpauth://totp/ExitPass:privileged.admin?secret=${sharedSecret}`,
    enrollmentStartedAt: "2030-01-01T00:00:00Z",
    correlationId: "10000000-0000-0000-0000-000000000010",
    errorCode: null
  };
}

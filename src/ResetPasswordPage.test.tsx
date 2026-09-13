import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { PasswordRecoveryError, type PasswordRecoveryClient } from "./passwordRecovery";

const material = { challengeReference: "opaque-reference", challengeSecret: "one-time-secret" };

describe("ExitPass reset-password page", () => {
  it("uses transient email-link material, resets once, ends old sessions, and proceeds to sign in", async () => {
    const client = successfulClient();
    render(<ResetPasswordPage initialMaterial={material} client={client} />);

    expect(screen.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    expect(screen.queryByText("Governed administration for authorized staff.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Reset reference")).toHaveValue(material.challengeReference);
    expect(screen.getByLabelText("Reset code")).toHaveValue(material.challengeSecret);
    await fillPasswordsAndSubmit("employee-owned-password");

    await waitFor(() => expect(client.resetPassword).toHaveBeenCalledWith(material, "employee-owned-password"));
    expect(screen.getByRole("heading", { name: "Password reset complete" })).toBeVisible();
    expect(screen.getByText(/existing signed-in sessions were ended/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/management-platform/");
    expect(screen.queryByDisplayValue(material.challengeSecret)).not.toBeInTheDocument();
  });

  it("supports canonical manual reference/code entry and rejects mismatched confirmation locally", async () => {
    const client = successfulClient();
    render(<ResetPasswordPage client={client} />);
    await userEvent.type(screen.getByLabelText("Reset reference"), "manual-reference");
    await userEvent.type(screen.getByLabelText("Reset code"), "manual-code");
    await userEvent.type(screen.getByLabelText("New password"), "first-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different-password");
    await userEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(client.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("confirmation does not match");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Reset code")).toHaveValue("manual-code");
  });

  it("allows password-policy retry while invalid or replayed challenges are cleared", async () => {
    const passwordRejected = clientWith({
      resetPassword: vi.fn().mockRejectedValue(new PasswordRecoveryError("password-rejected", "PASSWORD_POLICY_FAILED", "Choose another password."))
    });
    const { rerender } = render(<ResetPasswordPage initialMaterial={material} client={passwordRejected} />);
    await fillPasswordsAndSubmit("policy-rejected-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose another password");
    expect(screen.getByLabelText("Reset code")).toHaveValue(material.challengeSecret);
    expect(screen.getByLabelText("New password")).toHaveValue("");

    const invalid = clientWith({
      resetPassword: vi.fn().mockRejectedValue(new PasswordRecoveryError("invalid-or-expired", "INVALID_OR_EXPIRED_CHALLENGE", "The reset details are no longer usable."))
    });
    rerender(<ResetPasswordPage initialMaterial={material} client={invalid} />);
    await fillPasswordsAndSubmit("another-employee-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Request a new password reset link");
    expect(screen.getByLabelText("Reset reference")).toHaveValue("");
    expect(screen.getByLabelText("Reset code")).toHaveValue("");
  });

  it("prevents duplicate submission and retains only reset material for controlled retry", async () => {
    let rejectRequest: (reason: unknown) => void = () => undefined;
    const pending = new Promise<never>((_, reject) => { rejectRequest = reject; });
    const client = clientWith({ resetPassword: vi.fn().mockReturnValue(pending) });
    render(<ResetPasswordPage initialMaterial={material} client={client} />);
    await userEvent.type(screen.getByLabelText("New password"), "employee-owned-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "employee-owned-password");
    fireEvent.submit(screen.getByRole("button", { name: "Reset password" }).closest("form")!);
    expect(screen.getByRole("button", { name: "Resetting password" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Resetting password" }).closest("form")!);
    expect(client.resetPassword).toHaveBeenCalledOnce();

    await act(async () => rejectRequest(new PasswordRecoveryError("unavailable", "PASSWORD_RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable.", true)));
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByLabelText("Reset code")).toHaveValue(material.challengeSecret);
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });

  it("does not write reset or password material to browser storage", async () => {
    localStorage.clear();
    sessionStorage.clear();
    render(<ResetPasswordPage initialMaterial={material} client={successfulClient()} />);
    await fillPasswordsAndSubmit("employee-owned-password");
    await screen.findByRole("heading", { name: "Password reset complete" });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

function successfulClient(): PasswordRecoveryClient {
  return clientWith({
    resetPassword: vi.fn().mockResolvedValue({
      outcome: "PASSWORD_RESET_COMPLETED",
      authenticated: false,
      errorCode: null,
      retryable: false,
      correlationId: "safe-correlation"
    })
  });
}

function clientWith(overrides: Partial<PasswordRecoveryClient>): PasswordRecoveryClient {
  return { requestReset: vi.fn(), resetPassword: vi.fn(), ...overrides };
}

async function fillPasswordsAndSubmit(password: string) {
  await userEvent.type(screen.getByLabelText("New password"), password);
  await userEvent.type(screen.getByLabelText("Confirm new password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

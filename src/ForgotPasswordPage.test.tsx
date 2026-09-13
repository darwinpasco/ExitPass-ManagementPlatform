import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { PasswordRecoveryError, type PasswordRecoveryClient } from "./passwordRecovery";

describe("ExitPass forgot-password page", () => {
  it("asks only for username and shows the same safe confirmation", async () => {
    const client = successfulClient();
    render(<ForgotPasswordPage client={client} />);

    expect(screen.getByRole("heading", { name: "Forgot password" })).toBeVisible();
    expect(screen.getByLabelText("Username")).toHaveFocus();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/mobile/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Username"), "unknown-or-no-email-user");
    await userEvent.click(screen.getByRole("button", { name: "Request password reset" }));

    await waitFor(() => expect(client.requestReset).toHaveBeenCalledWith("unknown-or-no-email-user"));
    expect(screen.getByRole("heading", { name: "Check for a reset link" })).toBeVisible();
    expect(screen.getByText(/If an eligible ExitPass account with a registered email address/)).toBeVisible();
    expect(screen.getByText(/contact your administrator/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Sign in" })).toHaveAttribute("href", "/management-platform/");
    expect(document.body.textContent).not.toMatch(/username not found|account has no email|email required/i);
  });

  it("prevents duplicate requests and shows a controlled unavailable state", async () => {
    let rejectRequest: (reason: unknown) => void = () => undefined;
    const pending = new Promise<never>((_, reject) => { rejectRequest = reject; });
    const client = clientWith({ requestReset: vi.fn().mockReturnValue(pending) });
    render(<ForgotPasswordPage client={client} />);
    await userEvent.type(screen.getByLabelText("Username"), "employee");
    fireEvent.submit(screen.getByRole("button", { name: "Request password reset" }).closest("form")!);

    expect(screen.getByRole("button", { name: "Submitting request" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Submitting request" }).closest("form")!);
    expect(client.requestReset).toHaveBeenCalledOnce();
    await act(async () => rejectRequest(new PasswordRecoveryError("unavailable", "PASSWORD_RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable.", true)));
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
  });
});

function successfulClient(): PasswordRecoveryClient {
  return clientWith({ requestReset: vi.fn().mockResolvedValue({ outcome: "REQUEST_ACCEPTED", correlationId: "safe-correlation" }) });
}

function clientWith(overrides: Partial<PasswordRecoveryClient>): PasswordRecoveryClient {
  return {
    requestReset: vi.fn(),
    resetPassword: vi.fn(),
    ...overrides
  };
}

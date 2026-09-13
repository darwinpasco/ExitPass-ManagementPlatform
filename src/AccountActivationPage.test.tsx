import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AccountActivationPage } from "./AccountActivationPage";
import { AccountActivationError, type AccountActivationClient } from "./accountActivation";

const material = { challengeReference: "opaque-reference", challengeSecret: "one-time-secret" };

describe("ExitPass account activation page", () => {
  it("bootstraps email/QR material in transient fields and activates without an authenticated shell", async () => {
    const client = successfulClient();
    render(<AccountActivationPage initialMaterial={material} client={client} />);

    expect(screen.getByRole("heading", { name: "Activate your ExitPass account" })).toBeVisible();
    expect(screen.queryByText("Governed administration for authorized staff.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Activation reference")).toHaveValue(material.challengeReference);
    expect(screen.getByLabelText("Activation code")).toHaveValue(material.challengeSecret);

    await userEvent.type(screen.getByLabelText("New password"), "employee-owned-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "employee-owned-password");
    await userEvent.click(screen.getByRole("button", { name: "Activate account" }));

    await waitFor(() => expect(client.activate).toHaveBeenCalledWith(material, "employee-owned-password"));
    expect(screen.getByRole("heading", { name: "Account activated" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/management-platform/");
    expect(screen.queryByDisplayValue("one-time-secret")).not.toBeInTheDocument();
  });

  it("supports manual admin-issued reference/code entry and rejects mismatched confirmation locally", async () => {
    const client = successfulClient();
    render(<AccountActivationPage client={client} />);

    await userEvent.type(screen.getByLabelText("Activation reference"), "manual-reference");
    await userEvent.type(screen.getByLabelText("Activation code"), "manual-code");
    await userEvent.type(screen.getByLabelText("New password"), "first-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different-password");
    await userEvent.click(screen.getByRole("button", { name: "Activate account" }));

    expect(client.activate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("confirmation does not match");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
    expect(screen.getByLabelText("Activation code")).toHaveValue("manual-code");
  });

  it("allows password-policy retry while invalid challenges are cleared and safely classified", async () => {
    const passwordRejected: AccountActivationClient = {
      activate: vi.fn().mockRejectedValue(new AccountActivationError("password-rejected", "PASSWORD_POLICY_FAILED", "Choose another password."))
    };
    const { rerender } = render(<AccountActivationPage initialMaterial={material} client={passwordRejected} />);
    await fillPasswordsAndSubmit("policy-rejected-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose another password");
    expect(screen.getByLabelText("Activation reference")).toHaveValue(material.challengeReference);
    expect(screen.getByLabelText("Activation code")).toHaveValue(material.challengeSecret);
    expect(screen.getByLabelText("New password")).toHaveValue("");

    const invalid: AccountActivationClient = {
      activate: vi.fn().mockRejectedValue(new AccountActivationError("invalid-or-expired", "INVALID_OR_EXPIRED_CHALLENGE", "The activation details are no longer usable."))
    };
    rerender(<AccountActivationPage initialMaterial={material} client={invalid} />);
    await fillPasswordsAndSubmit("another-employee-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("new invitation or activation code");
    expect(screen.getByLabelText("Activation reference")).toHaveValue("");
    expect(screen.getByLabelText("Activation code")).toHaveValue("");
  });

  it("disables duplicate submission and gives a controlled retry posture when unavailable", async () => {
    let rejectRequest: (reason: unknown) => void = () => undefined;
    const pending = new Promise<never>((_, reject) => { rejectRequest = reject; });
    const client: AccountActivationClient = { activate: vi.fn().mockReturnValue(pending) };
    render(<AccountActivationPage initialMaterial={material} client={client} />);
    await userEvent.type(screen.getByLabelText("New password"), "employee-owned-password");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "employee-owned-password");
    fireEvent.submit(screen.getByRole("button", { name: "Activate account" }).closest("form")!);

    expect(screen.getByRole("button", { name: "Activating account" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Activating account" }).closest("form")!);
    expect(client.activate).toHaveBeenCalledOnce();

    await act(async () => rejectRequest(new AccountActivationError("unavailable", "ACCOUNT_ACTIVATION_UNAVAILABLE", "Activation is temporarily unavailable.", true)));
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
    expect(screen.getByLabelText("Activation code")).toHaveValue(material.challengeSecret);
  });

  it("does not write challenge or password material to browser storage", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const client = successfulClient();
    render(<AccountActivationPage initialMaterial={material} client={client} />);
    await fillPasswordsAndSubmit("employee-owned-password");
    await screen.findByRole("heading", { name: "Account activated" });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

function successfulClient(): AccountActivationClient {
  return {
    activate: vi.fn().mockResolvedValue({
      outcome: "ACCOUNT_ACTIVATED",
      authenticated: false,
      errorCode: null,
      retryable: false,
      correlationId: "safe-correlation"
    })
  };
}

async function fillPasswordsAndSubmit(password: string) {
  await userEvent.type(screen.getByLabelText("New password"), password);
  await userEvent.type(screen.getByLabelText("Confirm new password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Activate account" }));
}

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DeviceAdministrationPage } from "./DeviceAdministrationPage";
import type { DeviceAdministrationClient, DeviceDetails, DeviceProvisioningCredential, DeviceSummary } from "./deviceAdministration";

describe("DeviceAdministrationPage", () => {
  it("shows the governed list/details without exposing secret trust material", async () => {
    const client = fakeClient();
    render(<DeviceAdministrationPage client={client} canManage />);

    expect(await screen.findByRole("button", { name: "PITX APT 01" })).toBeInTheDocument();
    expect(screen.getByText("Assisted Payment Terminal")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "PITX APT 01" }));

    expect(await screen.findByRole("region", { name: "Device details" })).toHaveTextContent("DEV-APT-01");
    expect(screen.getByText("Credential rotation history")).toBeInTheDocument();
    expect(screen.getByText("Recent administrative actions")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/token_hash|private key|runtime-secret|certificate-private/i);
  });

  it("registers both governed device types from canonical Site scope", async () => {
    const client = fakeClient();
    render(<DeviceAdministrationPage client={client} canManage />);
    await screen.findByRole("button", { name: "PITX APT 01" });

    await userEvent.click(screen.getByRole("button", { name: "Register device" }));
    let dialog = screen.getByRole("dialog", { name: "Register device" });
    await userEvent.type(within(dialog).getByLabelText("Device name"), "PITX Operator Console 02");
    await userEvent.selectOptions(within(dialog).getByLabelText("Device type"), "OPERATOR_CONSOLE");
    await userEvent.type(within(dialog).getByLabelText("Terminal / workstation identifier"), "OC-02");
    await userEvent.click(within(dialog).getByRole("button", { name: "Register device" }));
    await waitFor(() => expect(client.register).toHaveBeenCalledWith(expect.objectContaining({
      deviceType: "OPERATOR_CONSOLE", siteId: "site-pitx", siteGroupId: "group-pitx", terminalIdentifier: "OC-02"
    })));

    await userEvent.click(screen.getByRole("button", { name: "Register device" }));
    dialog = screen.getByRole("dialog", { name: "Register device" });
    await userEvent.type(within(dialog).getByLabelText("Device name"), "PITX APT 02");
    await userEvent.selectOptions(within(dialog).getByLabelText("Device type"), "ASSISTED_PAYMENT_TERMINAL");
    const terminal = within(dialog).getByLabelText("Terminal / workstation identifier");
    expect(terminal).toBeRequired();
    await userEvent.type(terminal, "APT-02");
    const terminalSerial = within(dialog).getByLabelText("Terminal serial number");
    expect(terminalSerial).toBeRequired();
    await userEvent.type(terminalSerial, "APT-HARDWARE-002");
    await userEvent.click(within(dialog).getByRole("button", { name: "Register device" }));
    await waitFor(() => expect(client.register).toHaveBeenLastCalledWith(expect.objectContaining({
      deviceType: "ASSISTED_PAYMENT_TERMINAL", siteId: "site-pitx", siteGroupId: null,
      terminalIdentifier: "APT-02", terminalSerialNumber: "APT-HARDWARE-002"
    })));
  });

  it("displays provisioning once and deliberately confirms revoke and replace", async () => {
    const client = fakeClient();
    render(<DeviceAdministrationPage client={client} canManage />);
    await userEvent.click(await screen.findByRole("button", { name: "PITX APT 01" }));
    await screen.findByRole("region", { name: "Device details" });

    await userEvent.click(screen.getByRole("button", { name: "Rotate credentials" }));
    let dialog = screen.getByRole("dialog", { name: /credential rotation PITX APT 01/i });
    expect(dialog).toHaveTextContent("invalidated before fresh one-time rotation material");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm credential rotation" }));
    const materialDialog = await screen.findByRole("dialog", { name: "One-time provisioning credential" });
    expect(materialDialog).toHaveTextContent("cannot be recovered or displayed again");
    const enrollmentPackage = (within(materialDialog).getByLabelText("One-time enrollment package value") as HTMLTextAreaElement).value;
    expect(enrollmentPackage).toContain("one-time-device-token");
    expect(enrollmentPackage).toContain('"deviceType":"ASSISTED_PAYMENT_TERMINAL"');
    expect(enrollmentPackage).toContain('"siteGroupId":"group-pitx"');
    await userEvent.click(within(materialDialog).getByRole("button", { name: /I have stored it/i }));
    expect(screen.queryByText("one-time-device-token")).not.toBeInTheDocument();

    const replaceButton = screen.getByRole("button", { name: "Replace" });
    const revokeButton = screen.getByRole("button", { name: "Revoke" });
    expect(replaceButton).toHaveClass("dangerButton");
    expect(revokeButton).toHaveClass("dangerButton");
    await userEvent.click(replaceButton);
    dialog = screen.getByRole("dialog", { name: /replace PITX APT 01/i });
    expect(dialog).toHaveTextContent("old identity will become REPLACED");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm replace" }));
    expect(await screen.findByRole("dialog", { name: "One-time provisioning credential" })).toBeInTheDocument();
    expect(client.replace).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation before cancelling outstanding provisioning", async () => {
    const client = fakeClient();
    const pending = { ...deviceSummary(), lifecycleStatus: "PROVISIONING_PENDING", lastProvisioningStatus: "ISSUED" };
    client.list.mockResolvedValue([pending]);
    client.get.mockResolvedValue(deviceDetails(pending));
    render(<DeviceAdministrationPage client={client} canManage />);
    await userEvent.click(await screen.findByRole("button", { name: "PITX APT 01" }));

    await userEvent.click(await screen.findByRole("button", { name: "Cancel provisioning" }));
    const dialog = screen.getByRole("dialog", { name: /provisioning cancellation PITX APT 01/i });
    expect(dialog).toHaveTextContent("one-time credential will become unusable");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirm provisioning cancellation" }));

    await waitFor(() => expect(client.cancelProvisioning).toHaveBeenCalledWith("device-apt-01", "PROVISIONING_CANCELLED"));
  });

  it("hides all lifecycle mutations from read-only users", async () => {
    const client = fakeClient();
    render(<DeviceAdministrationPage client={client} canManage={false} />);
    await userEvent.click(await screen.findByRole("button", { name: "PITX APT 01" }));
    await screen.findByRole("region", { name: "Device details" });
    expect(screen.queryByRole("button", { name: "Register device" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only device access/i)).toBeInTheDocument();
  });
});

function fakeClient(): DeviceAdministrationClient & Record<keyof DeviceAdministrationClient, ReturnType<typeof vi.fn>> {
  const summary = deviceSummary();
  const details = deviceDetails(summary);
  const provisioning = oneTimeMaterial(summary);
  return {
    list: vi.fn(async () => [summary]),
    listScopes: vi.fn(async () => [{ siteId: "site-pitx", siteCode: "PITX-L3", siteName: "PITX Level 3", siteGroupId: "group-pitx", siteGroupCode: "PITX", siteGroupName: "PITX" }]),
    get: vi.fn(async () => details),
    register: vi.fn(async input => ({ ...summary, deviceId: crypto.randomUUID(), deviceName: input.deviceName, deviceType: input.deviceType, terminalIdentifier: input.terminalIdentifier })),
    provision: vi.fn(async () => provisioning),
    cancelProvisioning: vi.fn(async () => ({ ...summary, lifecycleStatus: "REGISTERED", lastProvisioningStatus: "CANCELLED" })),
    suspend: vi.fn(async () => ({ ...summary, lifecycleStatus: "SUSPENDED" })),
    reactivate: vi.fn(async () => summary),
    revoke: vi.fn(async () => ({ ...summary, lifecycleStatus: "REVOKED" })),
    rotate: vi.fn(async () => ({ ...provisioning, purpose: "ROTATION" })),
    replace: vi.fn(async () => ({ replacedDevice: { ...summary, lifecycleStatus: "REPLACED" }, replacementDevice: { ...summary, deviceId: "device-replacement", deviceReference: "DEV-APT-02", deviceName: "PITX APT 01 replacement", lifecycleStatus: "PROVISIONING_PENDING", credentialVersion: 0 }, provisioning: { ...provisioning, deviceId: "device-replacement", deviceReference: "DEV-APT-02", purpose: "REPLACEMENT" } }))
  } as DeviceAdministrationClient & Record<keyof DeviceAdministrationClient, ReturnType<typeof vi.fn>>;
}

function deviceSummary(): DeviceSummary {
  return {
    deviceId: "device-apt-01", deviceReference: "DEV-APT-01", deviceName: "PITX APT 01",
    deviceType: "ASSISTED_PAYMENT_TERMINAL", description: "Cashier assisted terminal", terminalIdentifier: "APT-01", terminalSerialNumber: "APT-HARDWARE-001",
    serviceIdentityId: "service-apt-01", siteId: "site-pitx", siteCode: "PITX-L3", siteName: "PITX Level 3",
    siteGroupId: "group-pitx", siteGroupCode: "PITX", siteGroupName: "PITX", lifecycleStatus: "ACTIVE",
    lastProvisioningStatus: "CONSUMED", credentialVersion: 1, credentialStatus: "ACTIVE",
    createdAt: "2030-01-01T00:00:00Z", updatedAt: "2030-01-02T00:00:00Z", rowVersion: 2
  };
}

function deviceDetails(device: DeviceSummary): DeviceDetails {
  return {
    device,
    provisioningHistory: [{ provisioningReference: "provision-1", purpose: "ENROLLMENT", status: "CONSUMED", issuedAt: "2030-01-01T00:00:00Z", expiresAt: "2030-01-01T00:15:00Z", consumedAt: "2030-01-01T00:05:00Z", cancelledAt: null, intendedCredentialVersion: 1, correlationId: "correlation-provision" }],
    credentialHistory: [{ credentialVersion: 1, credentialType: "MTLS_CERTIFICATE_REFERENCE", status: "ACTIVE", activatedAt: "2030-01-01T00:05:00Z", expiresAt: null, revokedAt: null, revocationReasonCode: null, correlationId: "correlation-enroll" }],
    recentAdministrativeActions: [{ action: "ENROLL", previousState: "PROVISIONING_PENDING", resultingState: "ACTIVE", siteId: "site-pitx", siteGroupId: "group-pitx", previousCredentialVersion: 0, resultingCredentialVersion: 1, actorUserId: null, actorServiceIdentityId: "service-apt-01", reasonCode: "DEVICE_ENROLLED", correlationId: "correlation-enroll", occurredAt: "2030-01-01T00:05:00Z" }],
    predecessorDeviceId: null, predecessorDeviceReference: null, replacementDeviceId: null, replacementDeviceReference: null
  };
}

function oneTimeMaterial(device: DeviceSummary): DeviceProvisioningCredential {
  return { deviceId: device.deviceId, deviceReference: device.deviceReference, deviceType: device.deviceType, siteId: device.siteId, siteGroupId: device.siteGroupId, terminalIdentifier: device.terminalIdentifier, terminalSerialNumber: device.terminalSerialNumber, provisioningCredential: "one-time-device-token", expiresAt: "2030-01-01T00:15:00Z", purpose: "ENROLLMENT", displayPolicy: "Shown once", correlationId: "correlation-material" };
}

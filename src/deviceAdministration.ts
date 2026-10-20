import type { CentralPmsApiClient } from "./types";

export const deviceAdministrationRoute = "/management-platform/device-administration";
export const deviceAdministrationApiRoute = "/v1/management-platform/devices";

export const deviceAdministrationPermissions = {
  view: "device.view",
  manage: "device.manage"
} as const;

export const deviceTypes = ["OPERATOR_CONSOLE", "ASSISTED_PAYMENT_TERMINAL"] as const;
export type DeviceType = typeof deviceTypes[number];

export interface DeviceSummary {
  deviceId: string;
  deviceReference: string;
  deviceName: string;
  deviceType: DeviceType | string;
  description: string | null;
  terminalIdentifier: string | null;
  terminalSerialNumber: string | null;
  serviceIdentityId: string;
  siteId: string;
  siteCode: string;
  siteName: string;
  siteGroupId: string;
  siteGroupCode: string;
  siteGroupName: string;
  lifecycleStatus: string;
  lastProvisioningStatus: string | null;
  credentialVersion: number;
  credentialStatus: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface DeviceAdministrationSiteScope {
  siteId: string;
  siteCode: string;
  siteName: string;
  siteGroupId: string;
  siteGroupCode: string;
  siteGroupName: string;
}

export interface DeviceProvisioningHistory {
  provisioningReference: string;
  purpose: string;
  status: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  cancelledAt: string | null;
  intendedCredentialVersion: number;
  correlationId: string;
}

export interface DeviceCredentialHistory {
  credentialVersion: number;
  credentialType: string;
  status: string;
  activatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReasonCode: string | null;
  correlationId: string;
}

export interface DeviceAdministrativeAction {
  action: string;
  previousState: string | null;
  resultingState: string;
  siteId: string;
  siteGroupId: string | null;
  previousCredentialVersion: number | null;
  resultingCredentialVersion: number;
  actorUserId: string | null;
  actorServiceIdentityId: string | null;
  reasonCode: string | null;
  correlationId: string;
  occurredAt: string;
}

export interface DeviceDetails {
  device: DeviceSummary;
  provisioningHistory: DeviceProvisioningHistory[];
  credentialHistory: DeviceCredentialHistory[];
  recentAdministrativeActions: DeviceAdministrativeAction[];
  predecessorDeviceId: string | null;
  predecessorDeviceReference: string | null;
  replacementDeviceId: string | null;
  replacementDeviceReference: string | null;
}

export interface DeviceProvisioningCredential {
  deviceId: string;
  deviceReference: string;
  deviceType: string;
  siteId: string;
  siteGroupId: string;
  terminalIdentifier: string | null;
  terminalSerialNumber: string | null;
  provisioningCredential: string;
  expiresAt: string;
  purpose: "ENROLLMENT" | "ROTATION" | "REPLACEMENT" | string;
  displayPolicy: string;
  correlationId: string;
}

export interface ReplaceDeviceResult {
  replacedDevice: DeviceSummary;
  replacementDevice: DeviceSummary;
  provisioning: DeviceProvisioningCredential;
}

export interface RegisterDeviceInput {
  deviceName: string;
  deviceType: DeviceType;
  description: string | null;
  siteId: string;
  siteGroupId: string | null;
  terminalIdentifier: string | null;
  terminalSerialNumber: string | null;
}

export interface ReplaceDeviceInput {
  deviceName: string | null;
  description: string | null;
  siteId: string | null;
  siteGroupId: string | null;
  terminalIdentifier: string | null;
  terminalSerialNumber: string | null;
  reasonCode: string;
}

export interface DeviceAdministrationClient {
  list(signal?: AbortSignal): Promise<DeviceSummary[]>;
  listScopes(signal?: AbortSignal): Promise<DeviceAdministrationSiteScope[]>;
  get(deviceId: string, signal?: AbortSignal): Promise<DeviceDetails>;
  register(input: RegisterDeviceInput): Promise<DeviceSummary>;
  provision(deviceId: string): Promise<DeviceProvisioningCredential>;
  cancelProvisioning(deviceId: string, reasonCode: string): Promise<DeviceSummary>;
  suspend(deviceId: string, reasonCode: string): Promise<DeviceSummary>;
  reactivate(deviceId: string, reasonCode: string): Promise<DeviceSummary>;
  revoke(deviceId: string, reasonCode: string): Promise<DeviceSummary>;
  rotate(deviceId: string, reasonCode: string): Promise<DeviceProvisioningCredential>;
  replace(deviceId: string, input: ReplaceDeviceInput): Promise<ReplaceDeviceResult>;
}

export function createDeviceAdministrationClient(api: CentralPmsApiClient): DeviceAdministrationClient {
  const mutation = <T>(path: string, body?: unknown) => api.request<T>(path, {
    method: "POST",
    body,
    requireJsonContentType: true
  });

  return {
    list: (signal) => api.request<DeviceSummary[]>(deviceAdministrationApiRoute, { signal, requireJsonContentType: true }),
    listScopes: (signal) => api.request<DeviceAdministrationSiteScope[]>(`${deviceAdministrationApiRoute}/scopes`, { signal, requireJsonContentType: true }),
    get: (deviceId, signal) => api.request<DeviceDetails>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}`, { signal, requireJsonContentType: true }),
    register: (input) => mutation<DeviceSummary>(deviceAdministrationApiRoute, input),
    provision: (deviceId) => mutation<DeviceProvisioningCredential>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/provisioning`),
    cancelProvisioning: (deviceId, reasonCode) => mutation<DeviceSummary>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/provisioning/cancel`, { reasonCode }),
    suspend: (deviceId, reasonCode) => mutation<DeviceSummary>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/suspend`, { reasonCode }),
    reactivate: (deviceId, reasonCode) => mutation<DeviceSummary>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/reactivate`, { reasonCode }),
    revoke: (deviceId, reasonCode) => mutation<DeviceSummary>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/revoke`, { reasonCode }),
    rotate: (deviceId, reasonCode) => mutation<DeviceProvisioningCredential>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/rotate`, { reasonCode }),
    replace: (deviceId, input) => mutation<ReplaceDeviceResult>(`${deviceAdministrationApiRoute}/${encodeURIComponent(deviceId)}/replace`, input)
  };
}

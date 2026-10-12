import { useEffect, useMemo, useState } from "react";
import type { ManagementPlatformUiError } from "./types";
import {
  deviceTypes,
  type DeviceAdministrationClient,
  type DeviceAdministrationSiteScope,
  type DeviceDetails,
  type DeviceProvisioningCredential,
  type DeviceSummary,
  type DeviceType,
  type RegisterDeviceInput,
  type ReplaceDeviceInput
} from "./deviceAdministration";

interface DeviceAdministrationPageProps {
  client: DeviceAdministrationClient;
  canManage: boolean;
}

type ConfirmAction = "cancel-provisioning" | "suspend" | "reactivate" | "revoke" | "rotate" | "replace";

const emptyRegistration: RegisterDeviceInput = {
  deviceName: "",
  deviceType: "OPERATOR_CONSOLE",
  description: null,
  siteId: "",
  siteGroupId: null,
  terminalIdentifier: null
};

export function DeviceAdministrationPage({ client, canManage }: DeviceAdministrationPageProps) {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [scopes, setScopes] = useState<DeviceAdministrationSiteScope[]>([]);
  const [details, setDetails] = useState<DeviceDetails>();
  const [selectedId, setSelectedId] = useState<string>();
  const [registration, setRegistration] = useState<RegisterDeviceInput>();
  const [oneTimeMaterial, setOneTimeMaterial] = useState<DeviceProvisioningCredential>();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>();
  const [reasonCode, setReasonCode] = useState("");
  const [replacement, setReplacement] = useState<ReplaceDeviceInput>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ManagementPlatformUiError>();

  const selected = details?.device;
  const activeScope = useMemo(() => scopes.find(scope => scope.siteId === registration?.siteId), [registration?.siteId, scopes]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([client.list(controller.signal), client.listScopes(controller.signal)])
      .then(([nextDevices, nextScopes]) => {
        setDevices(nextDevices);
        setScopes(nextScopes);
        setError(undefined);
      })
      .catch(reason => { if (!controller.signal.aborted) setError(toUiError(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [client]);

  async function refresh(selectDeviceId = selectedId) {
    const nextDevices = await client.list();
    setDevices(nextDevices);
    if (selectDeviceId) {
      const nextDetails = await client.get(selectDeviceId);
      setSelectedId(selectDeviceId);
      setDetails(nextDetails);
    }
  }

  async function selectDevice(deviceId: string) {
    setSelectedId(deviceId);
    setDetails(undefined);
    setError(undefined);
    try {
      setDetails(await client.get(deviceId));
    } catch (reason) {
      setError(toUiError(reason));
    }
  }

  async function submitRegistration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!registration || !activeScope) return;
    setPending(true);
    setError(undefined);
    try {
      const created = await client.register({
        ...registration,
        siteGroupId: registration.deviceType === "OPERATOR_CONSOLE" ? activeScope.siteGroupId : null,
        terminalIdentifier: clean(registration.terminalIdentifier)
      });
      setRegistration(undefined);
      await refresh(created.deviceId);
    } catch (reason) {
      setError(toUiError(reason));
    } finally {
      setPending(false);
    }
  }

  async function provision() {
    if (!selected) return;
    setPending(true);
    setError(undefined);
    try {
      const material = await client.provision(selected.deviceId);
      setOneTimeMaterial(material);
      await refresh(selected.deviceId);
    } catch (reason) {
      setError(toUiError(reason));
    } finally {
      setPending(false);
    }
  }

  function openAction(action: ConfirmAction) {
    if (!selected) return;
    setConfirmAction(action);
    setReasonCode(defaultReason(action));
    setReplacement(action === "replace" ? {
      deviceName: `${selected.deviceName} replacement`,
      description: selected.description,
      siteId: selected.siteId,
      siteGroupId: selected.deviceType === "OPERATOR_CONSOLE" ? selected.siteGroupId : null,
      terminalIdentifier: selected.terminalIdentifier,
      reasonCode: "HARDWARE_REPLACEMENT"
    } : undefined);
  }

  async function submitAction() {
    if (!selected || !confirmAction) return;
    setPending(true);
    setError(undefined);
    try {
      if (confirmAction === "cancel-provisioning") await client.cancelProvisioning(selected.deviceId, reasonCode);
      if (confirmAction === "suspend") await client.suspend(selected.deviceId, reasonCode);
      if (confirmAction === "reactivate") await client.reactivate(selected.deviceId, reasonCode);
      if (confirmAction === "revoke") await client.revoke(selected.deviceId, reasonCode);
      if (confirmAction === "rotate") setOneTimeMaterial(await client.rotate(selected.deviceId, reasonCode));
      if (confirmAction === "replace" && replacement) {
        const result = await client.replace(selected.deviceId, { ...replacement, reasonCode });
        setOneTimeMaterial(result.provisioning);
        setConfirmAction(undefined);
        await refresh(result.replacementDevice.deviceId);
        return;
      }
      setConfirmAction(undefined);
      await refresh(selected.deviceId);
    } catch (reason) {
      setError(toUiError(reason));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel deviceAdministrationPage" aria-labelledby="device-administration-title">
      <div className="pageTitle">
        <div>
          <p className="eyebrow">System administration</p>
          <h2 id="device-administration-title">Device Administration</h2>
          <p>Register and govern trusted ExitPass workstations and payment terminals.</p>
        </div>
        {canManage && <button type="button" onClick={() => setRegistration({ ...emptyRegistration, siteId: scopes[0]?.siteId ?? "" })}>Register device</button>}
      </div>

      {!canManage && <p className="reportNotice">You have read-only device access. Lifecycle actions require <strong>device.manage</strong>.</p>}
      {error && <SafeError error={error} />}
      {loading ? <p role="status">Loading governed devices…</p> : (
        <div className={`deviceMasterDetail ${selectedId ? "hasDetail" : ""}`}>
          <section className="deviceDirectory" aria-label="Device list">
            <div className="panelHeader"><h3>Devices</h3><span className="statusPill">{devices.length} total</span></div>
            {devices.length === 0 ? <p>No governed devices are registered.</p> : (
              <div className="tableScroller">
                <table>
                  <thead><tr><th>Name</th><th>Type</th><th>Reference</th><th>Site / Group</th><th>Lifecycle</th><th>Provisioning</th><th>Credential</th><th>Created</th><th>Updated</th></tr></thead>
                  <tbody>{devices.map(device => (
                    <tr key={device.deviceId} className={device.deviceId === selectedId ? "selectedTableRow" : undefined}>
                      <td><button className="tableLinkButton" type="button" onClick={() => void selectDevice(device.deviceId)}>{device.deviceName}</button></td>
                      <td>{formatDeviceType(device.deviceType)}</td>
                      <td><code>{device.deviceReference}</code></td>
                      <td>{device.siteName}<br /><small>{device.siteGroupName}</small></td>
                      <td><Status value={device.lifecycleStatus} /></td>
                      <td>{device.lastProvisioningStatus ?? "Not issued"}</td>
                      <td>v{device.credentialVersion} · {device.credentialStatus}</td>
                      <td>{formatDate(device.createdAt)}</td><td>{formatDate(device.updatedAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          {selectedId && <section className="deviceDetail" aria-label="Device details">
            {!details ? <p role="status">Loading device details…</p> : <>
              <div className="panelHeader"><div><h3>{details.device.deviceName}</h3><code>{details.device.deviceReference}</code></div><Status value={details.device.lifecycleStatus} /></div>
              <dl className="detailGrid">
                <dt>Canonical identity</dt><dd>{details.device.serviceIdentityId}</dd>
                <dt>Device type</dt><dd>{formatDeviceType(details.device.deviceType)}</dd>
                <dt>Site</dt><dd>{details.device.siteName} ({details.device.siteCode})</dd>
                <dt>Site Group</dt><dd>{details.device.siteGroupName} ({details.device.siteGroupCode})</dd>
                <dt>Terminal / workstation</dt><dd>{details.device.terminalIdentifier ?? "Not supplied"}</dd>
                <dt>Description</dt><dd>{details.device.description ?? "Not supplied"}</dd>
                <dt>Credential state</dt><dd>Version {details.device.credentialVersion} · {details.device.credentialStatus}</dd>
                <dt>Predecessor</dt><dd>{details.predecessorDeviceReference ?? "None"}</dd>
                <dt>Replacement</dt><dd>{details.replacementDeviceReference ?? "None"}</dd>
                <dt>Created</dt><dd>{formatDateTime(details.device.createdAt)}</dd>
                <dt>Last updated</dt><dd>{formatDateTime(details.device.updatedAt)}</dd>
              </dl>

              {canManage && <div className="deviceActions" aria-label="Device lifecycle actions">
                {["REGISTERED", "PROVISIONING_PENDING"].includes(details.device.lifecycleStatus) && <button type="button" disabled={pending} onClick={() => void provision()}>Provision device</button>}
                {["PROVISIONING_PENDING", "CREDENTIAL_ROTATION"].includes(details.device.lifecycleStatus) && <button className="secondaryButton" type="button" onClick={() => openAction("cancel-provisioning")}>Cancel provisioning</button>}
                {details.device.lifecycleStatus === "ACTIVE" && <button className="secondaryButton" type="button" onClick={() => openAction("suspend")}>Suspend</button>}
                {details.device.lifecycleStatus === "SUSPENDED" && <button className="secondaryButton" type="button" onClick={() => openAction("reactivate")}>Reactivate</button>}
                {["ACTIVE", "SUSPENDED"].includes(details.device.lifecycleStatus) && <button className="secondaryButton" type="button" onClick={() => openAction("rotate")}>Rotate credentials</button>}
                {details.device.lifecycleStatus === "ACTIVE" && <button className="dangerButton" type="button" onClick={() => openAction("replace")}>Replace</button>}
                {!(["REVOKED", "REPLACED"].includes(details.device.lifecycleStatus)) && <button className="dangerButton" type="button" onClick={() => openAction("revoke")}>Revoke</button>}
              </div>}

              <HistorySection title="Provisioning history" empty="No provisioning has been issued.">
                {details.provisioningHistory.map(item => <tr key={item.provisioningReference}><td>{item.purpose}</td><td>{item.status}</td><td>v{item.intendedCredentialVersion}</td><td>{formatDateTime(item.issuedAt)}</td><td>{formatDateTime(item.expiresAt)}</td><td>{item.consumedAt ? formatDateTime(item.consumedAt) : item.cancelledAt ? `Cancelled ${formatDateTime(item.cancelledAt)}` : "—"}</td></tr>)}
              </HistorySection>
              <HistorySection title="Credential rotation history" empty="No runtime credentials have been enrolled.">
                {details.credentialHistory.map(item => <tr key={`${item.credentialVersion}-${item.correlationId}`}><td>v{item.credentialVersion}</td><td>{item.credentialType}</td><td>{item.status}</td><td>{formatDateTime(item.activatedAt)}</td><td>{item.revokedAt ? formatDateTime(item.revokedAt) : "—"}</td><td>{item.revocationReasonCode ?? "—"}</td></tr>)}
              </HistorySection>
              <HistorySection title="Recent administrative actions" empty="No administrative actions have been recorded.">
                {details.recentAdministrativeActions.map(item => <tr key={`${item.action}-${item.correlationId}`}><td>{item.action}</td><td>{item.previousState ?? "None"} → {item.resultingState}</td><td>v{item.previousCredentialVersion ?? 0} → v{item.resultingCredentialVersion}</td><td>{item.reasonCode ?? "—"}</td><td>{formatDateTime(item.occurredAt)}</td><td><code>{item.correlationId}</code></td></tr>)}
              </HistorySection>
            </>}
          </section>}
        </div>
      )}

      {registration && <RegistrationDialog value={registration} scopes={scopes} pending={pending} onChange={setRegistration} onCancel={() => setRegistration(undefined)} onSubmit={submitRegistration} />}
      {confirmAction && selected && <ActionDialog action={confirmAction} device={selected} reasonCode={reasonCode} replacement={replacement} scopes={scopes} pending={pending} onReasonChange={setReasonCode} onReplacementChange={setReplacement} onCancel={() => setConfirmAction(undefined)} onConfirm={() => void submitAction()} />}
      {oneTimeMaterial && <OneTimeMaterialDialog material={oneTimeMaterial} onClose={() => setOneTimeMaterial(undefined)} />}
    </section>
  );
}

function RegistrationDialog({ value, scopes, pending, onChange, onCancel, onSubmit }: {
  value: RegisterDeviceInput;
  scopes: DeviceAdministrationSiteScope[];
  pending: boolean;
  onChange: (value: RegisterDeviceInput) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const scope = scopes.find(item => item.siteId === value.siteId);
  return <div className="modalBackdrop" role="presentation"><form className="deviceDialog" role="dialog" aria-modal="true" aria-labelledby="register-device-title" onSubmit={onSubmit}>
    <div className="panelHeader"><h3 id="register-device-title">Register device</h3><Status value="REGISTERED" /></div>
    <label>Device name<input required maxLength={128} value={value.deviceName} onChange={event => onChange({ ...value, deviceName: event.target.value })} /></label>
    <label>Device type<select value={value.deviceType} onChange={event => onChange({ ...value, deviceType: event.target.value as DeviceType })}>{deviceTypes.map(type => <option key={type} value={type}>{formatDeviceType(type)}</option>)}</select></label>
    <label>Site<select required value={value.siteId} onChange={event => onChange({ ...value, siteId: event.target.value })}><option value="">Select an active Site</option>{scopes.map(item => <option key={item.siteId} value={item.siteId}>{item.siteName} ({item.siteCode})</option>)}</select></label>
    <label>Site Group<input readOnly value={scope ? `${scope.siteGroupName} (${scope.siteGroupCode})` : "Selected from Site"} /></label>
    <label>Terminal / workstation identifier<input required={value.deviceType === "ASSISTED_PAYMENT_TERMINAL"} maxLength={128} value={value.terminalIdentifier ?? ""} onChange={event => onChange({ ...value, terminalIdentifier: event.target.value })} /></label>
    <label>Description<textarea maxLength={512} value={value.description ?? ""} onChange={event => onChange({ ...value, description: event.target.value || null })} /></label>
    {scopes.length === 0 && <p className="reportNotice">No active canonical Site is available. Create or activate a Site before registering a device.</p>}
    <div className="formActions"><button type="submit" disabled={pending || !scope}>{pending ? "Registering…" : "Register device"}</button><button className="secondaryButton" type="button" disabled={pending} onClick={onCancel}>Cancel</button></div>
  </form></div>;
}

function ActionDialog({ action, device, reasonCode, replacement, scopes, pending, onReasonChange, onReplacementChange, onCancel, onConfirm }: {
  action: ConfirmAction;
  device: DeviceSummary;
  reasonCode: string;
  replacement?: ReplaceDeviceInput;
  scopes: DeviceAdministrationSiteScope[];
  pending: boolean;
  onReasonChange: (value: string) => void;
  onReplacementChange: (value: ReplaceDeviceInput) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const destructive = action === "revoke" || action === "replace";
  const title = `${actionLabel(action)} ${device.deviceName}?`;
  const replacementScope = scopes.find(scope => scope.siteId === replacement?.siteId);
  return <div className="modalBackdrop" role="presentation"><section className="deviceDialog" role="dialog" aria-modal="true" aria-labelledby="device-action-title">
    <div className="panelHeader"><h3 id="device-action-title">{title}</h3><Status value={destructive ? "IRREVERSIBLE" : action.toUpperCase().replace("-", "_")} /></div>
    <p>{actionExplanation(action)}</p>
    <dl className="detailGrid"><dt>Device reference</dt><dd>{device.deviceReference}</dd><dt>Current state</dt><dd>{device.lifecycleStatus}</dd><dt>Site</dt><dd>{device.siteName}</dd></dl>
    {action === "replace" && replacement && <div className="formGrid compactForm">
      <label>Replacement device name<input required value={replacement.deviceName ?? ""} onChange={event => onReplacementChange({ ...replacement, deviceName: event.target.value })} /></label>
      <label>Site<select value={replacement.siteId ?? ""} onChange={event => onReplacementChange({ ...replacement, siteId: event.target.value, siteGroupId: scopes.find(scope => scope.siteId === event.target.value)?.siteGroupId ?? null })}>{scopes.map(scope => <option key={scope.siteId} value={scope.siteId}>{scope.siteName}</option>)}</select></label>
      <label>Site Group<input readOnly value={replacementScope?.siteGroupName ?? ""} /></label>
      <label>Terminal / workstation identifier<input value={replacement.terminalIdentifier ?? ""} onChange={event => onReplacementChange({ ...replacement, terminalIdentifier: event.target.value })} /></label>
      <label>Description<textarea value={replacement.description ?? ""} onChange={event => onReplacementChange({ ...replacement, description: event.target.value || null })} /></label>
    </div>}
    <label>Reason code<input required maxLength={64} value={reasonCode} onChange={event => onReasonChange(event.target.value.toUpperCase())} /></label>
    <div className="formActions"><button className={destructive ? "dangerButton" : undefined} type="button" disabled={pending || !reasonCode.trim()} onClick={onConfirm}>{pending ? "Submitting…" : `Confirm ${actionLabel(action)}`}</button><button className="secondaryButton" type="button" disabled={pending} onClick={onCancel}>Cancel</button></div>
  </section></div>;
}

function OneTimeMaterialDialog({ material, onClose }: { material: DeviceProvisioningCredential; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const enrollmentPackage = JSON.stringify({
    provisioningCredential: material.provisioningCredential,
    deviceReference: material.deviceReference,
    deviceType: material.deviceType,
    siteId: material.siteId,
    siteGroupId: material.siteGroupId,
    terminalIdentifier: material.terminalIdentifier
  });
  return <div className="modalBackdrop" role="presentation"><section className="deviceDialog oneTimeSecretDialog" role="dialog" aria-modal="true" aria-labelledby="one-time-material-title">
    <div className="panelHeader"><h3 id="one-time-material-title">One-time provisioning credential</h3><span className="statusPill warningPill">Shown once</span></div>
    <p className="reportNotice"><strong>This credential cannot be recovered or displayed again.</strong> Transfer it only to the intended device before it expires.</p>
    <dl className="detailGrid"><dt>Device reference</dt><dd>{material.deviceReference}</dd><dt>Purpose</dt><dd>{material.purpose}</dd><dt>Expires</dt><dd>{formatDateTime(material.expiresAt)}</dd><dt>Support reference</dt><dd>{material.correlationId}</dd></dl>
    <label>Enrollment package<textarea className="secretValue" readOnly value={enrollmentPackage} aria-label="One-time enrollment package value" /></label>
    <p className="fieldHint">The package contains the one-time credential and its server-validated device, type, and Site context. Paste the complete package into the intended device.</p>
    <div className="formActions"><button type="button" onClick={() => { void navigator.clipboard?.writeText(enrollmentPackage); setCopied(true); }}>{copied ? "Copied" : "Copy enrollment package"}</button><button className="secondaryButton" type="button" onClick={onClose}>I have stored it — close</button></div>
  </section></div>;
}

function HistorySection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const rows = Array.isArray(children) ? children : [children];
  return <section className="deviceHistory"><h4>{title}</h4>{rows.length === 0 ? <p>{empty}</p> : <div className="tableScroller"><table><tbody>{children}</tbody></table></div>}</section>;
}

function Status({ value }: { value: string }) {
  const tone = ["REVOKED", "REPLACED", "IRREVERSIBLE"].includes(value) ? "dangerPill" : ["SUSPENDED", "PROVISIONING_PENDING", "CREDENTIAL_ROTATION", "ROTATE"].includes(value) ? "warningPill" : "";
  return <span className={`statusPill ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function SafeError({ error }: { error: ManagementPlatformUiError }) {
  return <div className="stateMessage danger" role="alert"><h3>Device administration request failed safely</h3><p>{error.message}{error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}</p>{error.mutationUncertain && <p>Refresh and verify authoritative state before retrying.</p>}</div>;
}

function toUiError(value: unknown): ManagementPlatformUiError {
  if (value && typeof value === "object" && "kind" in value && "message" in value) return value as ManagementPlatformUiError;
  return { kind: "unknown", code: "DEVICE_ADMINISTRATION_FAILED", message: "The device administration request failed safely.", retryable: false, mutationUncertain: false };
}

function formatDeviceType(value: string) { return value === "OPERATOR_CONSOLE" ? "Operator Console" : value === "ASSISTED_PAYMENT_TERMINAL" ? "Assisted Payment Terminal" : value.replaceAll("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function clean(value: string | null) { return value?.trim() || null; }
function defaultReason(action: ConfirmAction) { return action === "cancel-provisioning" ? "PROVISIONING_CANCELLED" : action === "suspend" ? "ADMINISTRATIVE_SUSPENSION" : action === "reactivate" ? "ADMINISTRATIVE_REACTIVATION" : action === "revoke" ? "DEVICE_REVOKED" : action === "rotate" ? "CREDENTIAL_ROTATION" : "HARDWARE_REPLACEMENT"; }
function actionLabel(action: ConfirmAction) { return action === "cancel-provisioning" ? "provisioning cancellation" : action === "rotate" ? "credential rotation" : action; }
function actionExplanation(action: ConfirmAction) {
  if (action === "cancel-provisioning") return "The outstanding one-time credential will become unusable. Cancelling an initial enrollment returns the identity to REGISTERED; cancelling a rotation leaves it SUSPENDED until fresh credentials are provisioned.";
  if (action === "revoke") return "Revocation is terminal. Runtime trust and outstanding provisioning material will be invalidated, while historical records remain available.";
  if (action === "replace") return "The old identity will become REPLACED, its runtime credential will fail immediately, and a new identity with fresh one-time provisioning material will be created.";
  if (action === "rotate") return "The current runtime credential will be invalidated before fresh one-time rotation material is issued.";
  if (action === "suspend") return "Runtime trust will fail immediately. Historical records and the current credential version remain available for an eligible reactivation.";
  return "Central PMS will reactivate the device only if its assignment and current credential remain valid.";
}

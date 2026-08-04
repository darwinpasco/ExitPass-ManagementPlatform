import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCentralPmsApiClient } from "./apiClient";
import { EvidenceGovernancePage } from "./EvidenceGovernancePage";
import {
  createEvidenceGovernanceClient,
  evidenceGovernanceApiRoute,
  evidenceGovernanceContractVersion,
  evidenceGovernanceRequestPath,
  resolveEvidenceGovernanceScenario,
  type EvidenceGovernanceClient,
  type EvidenceGovernanceRequest,
  type EvidenceGovernanceResponse
} from "./evidenceGovernance";

const authorizedSites = [
  { siteId: "71000000-0000-0000-0000-000000000101", siteGroupId: "71000000-0000-0000-0000-000000000900", siteGroupDisplayName: "Development Site Group", displayName: "Development Site Alpha" },
  { siteId: "71000000-0000-0000-0000-000000000102", siteGroupId: "71000000-0000-0000-0000-000000000900", siteGroupDisplayName: "Development Site Group", displayName: "Development Site Beta" }
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("I-014 evidence governance client", () => {
  it("uses only the exact relative GET routes and server-supported query parameters", async () => {
    const response = await scenarioResponse("ready");
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = createEvidenceGovernanceClient(createCentralPmsApiClient({ fetchImpl }));

    await client.getGovernance({ scopeType: "ALL", entitlementType: "PWD", governanceStatus: "CONFIGURED_READY", readinessStatus: "READY", captureEnabled: true, includeStale: false });

    const [url, init] = fetchImpl.mock.calls[0];
    const requestInit = init!;
    expect(url).toBe(`${evidenceGovernanceApiRoute}?entitlementType=PWD&governanceStatus=CONFIGURED_READY&readinessStatus=READY&captureEnabled=true&includeStale=false`);
    expect(requestInit.method).toBe("GET");
    const headers = new Headers(requestInit.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-ExitPass-Permissions")).toBeNull();
    expect(headers.get("X-Management-Platform-Permissions")).toBeNull();
    expect(headers.get("X-ExitPass-Service-Identity-Id")).toBeNull();
    expect(headers.get("X-ExitPass-User-Id")).toBeNull();
  });

  it("uses the exact Site and Site Group detail routes", () => {
    expect(evidenceGovernanceRequestPath({ scopeType: "SITE", scopeReference: authorizedSites[0].siteId, includeStale: true }))
      .toBe(`${evidenceGovernanceApiRoute}/sites/${authorizedSites[0].siteId}?includeStale=true`);
    expect(evidenceGovernanceRequestPath({ scopeType: "SITE_GROUP", scopeReference: authorizedSites[0].siteGroupId, includeStale: true }))
      .toBe(`${evidenceGovernanceApiRoute}/site-groups/${authorizedSites[0].siteGroupId}?includeStale=true`);
  });

  it("rejects missing scope, malformed contract, and privacy-forbidden fields", async () => {
    expect(() => evidenceGovernanceRequestPath({ scopeType: "SITE", includeStale: true })).toThrow();
    const valid = await scenarioResponse("ready");
    const malformedPayloads = [
      { ...valid, contractVersion: "unsupported:v2" },
      { ...valid, sites: [{ ...valid.sites[0], objectKey: "must-not-enter-browser-contract" }] },
      { ...valid, sites: [{ ...valid.sites[0], evidenceSetReference: "must-not-enter-browser-contract" }] },
      { ...valid, sites: [{ ...valid.sites[0], bucketName: "must-not-enter-browser-contract" }] },
      { ...valid, sites: [{ ...valid.sites[0], providerSecret: "must-not-enter-browser-contract" }] }
    ];

    for (const payload of malformedPayloads) {
      const client = createEvidenceGovernanceClient(createCentralPmsApiClient({ fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }) }));
      await expect(client.getGovernance({ scopeType: "ALL", includeStale: true })).rejects.toMatchObject({ kind: "malformed-response" });
    }
  });
});

describe("EvidenceGovernancePage", () => {
  it("renders configured-ready and partially-ready authorized Sites without a false-ready loading state", async () => {
    let resolveRequest!: (value: EvidenceGovernanceResponse) => void;
    const pending = new Promise<EvidenceGovernanceResponse>((resolve) => { resolveRequest = resolve; });
    const client: EvidenceGovernanceClient = { getGovernance: () => pending };
    renderPage(client);

    expect(screen.getByRole("status", { name: "Loading statutory evidence governance" })).toHaveTextContent("without displaying a provisional ready state");
    expect(screen.queryByRole("button", { name: /Open details for/i })).not.toBeInTheDocument();

    await act(async () => resolveRequest(await scenarioResponse("ready")));
    expect(await screen.findByText("Development Site Alpha")).toBeInTheDocument();
    expect(screen.getByText("Development Site Beta")).toBeInTheDocument();
    expect(screen.getAllByText("Configured and ready").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Configured, partially ready").length).toBeGreaterThan(0);
  });

  it.each([
    ["incomplete", "Configuration incomplete", "Not configured"],
    ["capture-disabled", "Capture disabled", "Disabled"],
    ["configuration-unavailable", "Configuration unavailable", "Unavailable"],
    ["stale", "Stale authoritative response", "Stale"],
    ["unknown", "Unknown", "Unknown"]
  ] as const)("renders the %s governed state without reclassification", async (scenario, governanceText, readinessText) => {
    renderScenario(scenario);
    expect((await screen.findAllByText(governanceText)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(readinessText).length).toBeGreaterThan(0);
  });

  it("renders the controlled UNKNOWN state with fail-closed guidance", async () => {
    renderScenario("unknown");

    expect(await screen.findByRole("status", { name: "Unknown readiness classification" })).toBeVisible();
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });

  it("renders safe empty authorized scope separately from filtered empty results", async () => {
    const { unmount } = renderScenario("empty-scope");
    expect(await screen.findByRole("status", { name: "Empty authorized scope" })).toBeInTheDocument();
    unmount();

    renderScenario("ready");
    await screen.findByText("Development Site Alpha");
    await userEvent.type(screen.getByLabelText("Search returned safe fields"), "does-not-match");
    expect(screen.getByRole("status", { name: "No matching governance configuration" })).toBeInTheDocument();
  });

  it("renders only controlled warning and blocker codes with safe summaries", async () => {
    renderScenario("incomplete");
    await userEvent.click(await screen.findByRole("button", { name: "Open details for Development Site Alpha" }));
    expect(await screen.findByRole("region", { name: "Configuration warnings" })).toHaveTextContent("MAXIMUM_SIZE_NOT_CONFIGURED");
    expect(screen.getByRole("region", { name: "Configuration blockers" })).toHaveTextContent("UPLOAD_PROFILE_INCOMPLETE");
    expect(document.body).not.toHaveTextContent(/provider exception|stack trace|sql/i);
  });

  it("maps invalid server filters without retry or raw backend detail", async () => {
    const client: EvidenceGovernanceClient = {
      getGovernance: async () => Promise.reject({ kind: "validation", code: "INVALID_FILTER", message: "raw internal filter parser detail", retryable: false, mutationUncertain: false })
    };
    renderPage(client);
    const alert = await screen.findByRole("alert", { name: "Evidence governance filter invalid" });
    expect(alert).toHaveTextContent("selected evidence-governance filters are invalid");
    expect(alert).not.toHaveTextContent("raw internal filter parser detail");
    expect(screen.queryByRole("button", { name: "Retry evidence governance" })).not.toBeInTheDocument();
  });

  it("sends scope and classification filters to the client and applies safe text/freshness filters locally", async () => {
    const response = await scenarioResponse("ready");
    const getGovernance = vi.fn(async () => response);
    renderPage({ getGovernance });
    await screen.findByText("Development Site Alpha");

    await userEvent.selectOptions(screen.getByLabelText("Scope"), "SITE_GROUP");
    await userEvent.selectOptions(screen.getByLabelText("Entitlement"), "PWD");
    await userEvent.selectOptions(screen.getByLabelText("Governance status"), "CONFIGURED_PARTIALLY_READY");
    await userEvent.selectOptions(screen.getByLabelText("Readiness"), "PARTIALLY_READY");
    await userEvent.selectOptions(screen.getByLabelText("Capture"), "ENABLED");
    await waitFor(() => expect(getGovernance).toHaveBeenLastCalledWith(expect.objectContaining({
      scopeType: "SITE_GROUP",
      scopeReference: authorizedSites[0].siteGroupId,
      entitlementType: "PWD",
      governanceStatus: "CONFIGURED_PARTIALLY_READY",
      readinessStatus: "PARTIALLY_READY",
      captureEnabled: true
    }), expect.any(AbortSignal)));

    await userEvent.type(screen.getByLabelText("Search returned safe fields"), "Beta");
    expect(screen.queryByText("Development Site Alpha")).not.toBeInTheDocument();
    expect(screen.getByText("Development Site Beta")).toBeInTheDocument();
  });

  it.each([
    ["permission-denied", "Evidence governance permission denied", false],
    ["site-denied", "Site scope denied", false],
    ["site-group-denied", "Site Group scope denied", false],
    ["malformed", "Evidence governance response malformed", false],
    ["unavailable", "Evidence governance unavailable", true],
    ["transient-failure", "Evidence governance unavailable", true]
  ] as const)("renders the %s safe error state", async (scenario, title, retryable) => {
    renderScenario(scenario);
    const alert = await screen.findByRole("alert", { name: title });
    expect(alert).not.toHaveTextContent(/stack|sql|connection|bucket|object key|provider secret/i);
    expect(screen.queryByRole("button", { name: "Retry evidence governance" }) !== null).toBe(retryable);
  });

  it("retains and marks the previous result while refresh is in progress", async () => {
    const response = await scenarioResponse("ready");
    let resolveRefresh!: (value: EvidenceGovernanceResponse) => void;
    const getGovernance = vi.fn()
      .mockResolvedValueOnce(response)
      .mockImplementationOnce(() => new Promise<EvidenceGovernanceResponse>((resolve) => { resolveRefresh = resolve; }));
    renderPage({ getGovernance });
    await screen.findByText("Development Site Alpha");

    await userEvent.click(screen.getByRole("button", { name: "Refresh statutory evidence governance" }));
    expect(screen.getByRole("status", { name: "Refreshing statutory evidence governance" })).toBeInTheDocument();
    expect(screen.getByText("Development Site Alpha")).toBeInTheDocument();
    expect(screen.getByText(/retained during refresh/i)).toBeInTheDocument();

    await act(async () => resolveRefresh(response));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Refreshing statutory evidence governance" })).not.toBeInTheDocument());
  });

  it("opens keyboard-accessible details, copies only the support reference, and restores focus", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderScenario("ready");
    const trigger = await screen.findByRole("button", { name: "Open details for Development Site Alpha" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Development Site Alpha" });
    expect(dialog).toHaveTextContent("management-platform-statutory-evidence-governance:v1");
    expect(screen.getByRole("button", { name: "Close evidence governance details" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Copy support reference" }));
    expect(writeText).toHaveBeenCalledWith("I014-H004-SYNTHETIC-SUPPORT");
    expect(screen.getByText("Support reference copied.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("contains no mutation controls or customer evidence fields", async () => {
    renderScenario("ready");
    await screen.findByText("Development Site Alpha");
    const forbiddenControls = /create|edit|enable|disable|upload|preview|download|approve|reject|lock|hold|delete|request deletion|change retention|change media|change storage|change entitlement/i;
    for (const button of screen.getAllByRole("button")) {
      expect(button).not.toHaveAccessibleName(forbiddenControls);
    }
    expect(document.body).not.toHaveTextContent(/must-not-enter-browser-contract|synthetic-customer|synthetic-ticket|synthetic-plate|storage\.internal|test-secret-signing-material/i);
  });

  it("does not write governance authority to durable browser storage", async () => {
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    renderScenario("ready");
    await screen.findByText("Development Site Alpha");
    expect(localWrite).not.toHaveBeenCalled();
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("keeps filter and detail controls keyboard reachable with visible focus semantics", async () => {
    renderScenario("ready");
    await screen.findByText("Development Site Alpha");
    const scope = screen.getByLabelText("Scope");
    scope.focus();
    await userEvent.keyboard("{ArrowDown}");
    fireEvent.change(scope, { target: { value: "SITE_GROUP" } });
    expect(scope).toHaveFocus();
    const detail = screen.getByRole("button", { name: "Open details for Development Site Alpha" });
    detail.focus();
    expect(detail).toHaveFocus();
  });
});

function renderScenario(name: Parameters<typeof scenarioClient>[0]) {
  return renderPage(scenarioClient(name), name);
}

function renderPage(client: EvidenceGovernanceClient, developmentScenarioName?: Parameters<typeof scenarioClient>[0]) {
  return render(<EvidenceGovernancePage authorizedSites={authorizedSites} currentSite={authorizedSites[0]} client={client} developmentScenarioName={developmentScenarioName} />);
}

function scenarioClient(name: "ready" | "partially-ready" | "incomplete" | "capture-disabled" | "configuration-unavailable" | "stale" | "unknown" | "empty-scope" | "permission-denied" | "site-denied" | "site-group-denied" | "malformed" | "unavailable" | "transient-failure"): EvidenceGovernanceClient {
  return resolveEvidenceGovernanceScenario(true, `?mpEvidenceGovernanceScenario=${name}`)!.client;
}

async function scenarioResponse(name: Parameters<typeof scenarioClient>[0]): Promise<EvidenceGovernanceResponse> {
  return scenarioClient(name).getGovernance({ scopeType: "ALL", includeStale: true });
}

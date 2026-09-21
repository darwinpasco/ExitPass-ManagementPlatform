import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatutoryBenefitReviewPage } from "./StatutoryBenefitReviewPage";
import { parseDetail, parseQueue, statutoryBenefitReviewContractVersion, type StatutoryBenefitReviewClient, type StatutoryBenefitReviewQueue } from "./statutoryBenefitReview";

const site = { siteId: "10000000-0000-4000-8000-000000000001", displayName: "SITE-A" };
const reference = "20000000-0000-4000-8000-000000000001";
const queueValue: StatutoryBenefitReviewQueue = {
  contractVersion: statutoryBenefitReviewContractVersion,
  items: [{ requestReference: "30000000-0000-4000-8000-000000000001", decisionCommandReference: reference, parkingSessionReference: "40000000-0000-4000-8000-000000000001", ticketReference: "SAFE-001", siteReference: site.siteId, siteCode: "SITE-A", siteName: "SITE-A", sourceChannel: "WEBPAY", benefitType: "PWD", status: "PENDING_REVIEW", evidenceRequired: true, evidenceRecorded: true, submittedAt: "2026-08-24T01:00:00Z" }],
  page: 1, pageSize: 25, totalCount: 1, hasMore: false, correlationId: "50000000-0000-4000-8000-000000000001"
};
const detail = { ...queueValue.items[0], contractVersion: statutoryBenefitReviewContractVersion, requesterAttestation: true, beneficiaryResidencySatisfied: true, money: { originalAmountMinorUnits: 123456, discountAmountMinorUnits: 24691, finalPayableAmountMinorUnits: 108765, currency: "PHP" as const }, version: 7 };

describe("Statutory Benefit Requests", () => {
  it("parses the stable contract and rejects non-PHP money", () => {
    expect(parseQueue(queueValue).items[0].status).toBe("PENDING_REVIEW");
    expect(() => parseDetail({ ...detail, money: { ...detail.money, currency: "USD" } })).toThrow(/PHP/);
  });

  it("loads pending by default, renders PHP, evidence notice, and server pagination", async () => {
    const client = makeClient();
    renderPage(client);
    expect(await screen.findByText("Person with disability")).toBeInTheDocument();
    expect(client.list).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING", page: 1, pageSize: 25 }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: /Person with disability/ }));
    expect(await screen.findByText("₱1,234.56")).toBeInTheDocument();
    expect(screen.getByLabelText("Evidence privacy notice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByText("PWD ID")).toBeInTheDocument();
    expect(screen.getByText("City social welfare office")).toBeInTheDocument();
    expect(screen.getByText("***1234")).toBeInTheDocument();
    expect(screen.getByText("Residency attestation")).toBeInTheDocument();
  });

  it("streams current reviewable evidence through the protected preview client", async () => {
    const client = makeClient();
    vi.mocked(client.evidence).mockResolvedValue({
      contractVersion: statutoryBenefitReviewContractVersion,
      decisionCommandReference: reference,
      evidenceRequired: true,
      evidenceRecorded: true,
      items: [{
        evidenceType: "PWD_ID",
        captureMethod: "PROTECTED_UPLOAD",
        evidenceItemReference: "60000000-0000-4000-8000-000000000001",
        documentType: "PWD_ID",
        uploadStatus: "UPLOADED",
        validationStatus: "PASSED",
        malwareScanStatus: "CLEAN",
        reviewabilityStatus: "REVIEWABLE",
        previewPermitted: true
      }],
      correlationId: queueValue.correlationId
    });
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:review-preview"), revokeObjectURL: vi.fn() });
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    expect(await screen.findByAltText("Submitted statutory entitlement evidence")).toHaveAttribute("src", "blob:review-preview");
    expect(client.evidencePreview).toHaveBeenCalledWith(reference, "60000000-0000-4000-8000-000000000001", expect.any(AbortSignal));
  });

  it.each(["image/jpeg", "image/png"])("renders a protected %s preview", async (contentType) => {
    const client = makeClient();
    vi.mocked(client.evidence).mockResolvedValue({
      contractVersion: statutoryBenefitReviewContractVersion,
      decisionCommandReference: reference,
      evidenceRequired: true,
      evidenceRecorded: true,
      items: [{
        evidenceType: "ENTITLEMENT_PHOTO",
        captureMethod: "PROTECTED_UPLOAD",
        evidenceItemReference: "60000000-0000-4000-8000-000000000001",
        documentType: "SENIOR_CITIZEN_ID",
        contentType,
        uploadStatus: "UPLOADED",
        validationStatus: "PASSED",
        malwareScanStatus: "CLEAN",
        reviewabilityStatus: "REVIEWABLE",
        previewPermitted: true
      }],
      correlationId: queueValue.correlationId
    });
    vi.mocked(client.evidencePreview).mockResolvedValue(new Blob(["image"], { type: contentType }));
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => `blob:${contentType}`), revokeObjectURL: vi.fn() });

    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));

    expect(await screen.findByAltText("Submitted statutory entitlement evidence")).toHaveAttribute("src", `blob:${contentType}`);
    expect(screen.getByText("Status: REVIEWABLE")).toBeInTheDocument();
    expect(screen.getByText("Upload: UPLOADED")).toBeInTheDocument();
    expect(screen.getByText("Validation: PASSED")).toBeInTheDocument();
    expect(screen.getByText("Malware scan: CLEAN")).toBeInTheDocument();
  });

  it("shows the safe backend evidence diagnostic without treating evidence as absent", async () => {
    const client = makeClient();
    vi.mocked(client.evidence).mockRejectedValue({
      kind: "integration-unavailable",
      code: "STATUTORY_BENEFIT_EVIDENCE_UNAVAILABLE",
      message: "The evidence metadata is temporarily unavailable.",
      correlationId: "70000000-0000-4000-8000-000000000001",
      retryable: true,
      mutationUncertain: false
    });

    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));

    const diagnostic = await screen.findByRole("alert");
    expect(diagnostic).toHaveTextContent("Evidence metadata unavailable");
    expect(diagnostic).toHaveTextContent("STATUTORY_BENEFIT_EVIDENCE_UNAVAILABLE");
    expect(diagnostic).toHaveTextContent("70000000-0000-4000-8000-000000000001");
    expect(screen.queryByText(/not permitted for this session/i)).not.toBeInTheDocument();
  });

  it("submits rejection only with a reason and confirms the decision", async () => {
    const client = makeClient();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    await screen.findByRole("heading", { name: "Record decision" });
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection reason"), { target: { value: "IDENTITY_NOT_VERIFIABLE" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(client.decide).toHaveBeenCalledWith(reference, expect.objectContaining({ decision: "REJECT", rejectionReason: "IDENTITY_NOT_VERIFIABLE", expectedVersion: 7 })));
  });

  it("retains the controlled conflict after refreshing authoritative detail", async () => {
    const client = makeClient();
    vi.mocked(client.list)
      .mockResolvedValueOnce(queueValue)
      .mockResolvedValueOnce({ ...queueValue, items: [], totalCount: 0 });
    vi.mocked(client.get)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({
        ...detail,
        status: "APPROVED",
        decision: {
          decision: "APPROVE",
          reviewerDisplayName: "Other reviewer",
          decidedAt: "2026-08-24T01:05:00Z"
        }
      });
    vi.mocked(client.decide).mockRejectedValue({
      kind: "conflict",
      code: "STATUTORY_BENEFIT_REVIEW_ALREADY_DECIDED",
      message: "Another reviewer already recorded the final decision.",
      retryable: false,
      mutationUncertain: false
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("heading", { name: "Decision already recorded" })).toBeInTheDocument();
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: /Person with disability/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Final decision" }).parentElement).toHaveTextContent("Approved by Other reviewer");
  });

  it("does not request detail or evidence without presentation permissions", async () => {
    const client = makeClient();
    render(<StatutoryBenefitReviewPage client={client} authorizedSites={[site]} canViewDetail={false} canViewEvidence={false} canApprove={false} canReject={false} />);
    const item = await screen.findByRole("button", { name: /Person with disability/ });
    expect(item).toBeDisabled();
    expect(client.get).not.toHaveBeenCalled();
    expect(client.evidence).not.toHaveBeenCalled();
  });
});

function renderPage(client: StatutoryBenefitReviewClient) {
  return render(<StatutoryBenefitReviewPage client={client} authorizedSites={[site]} canViewDetail canViewEvidence canApprove canReject />);
}

function makeClient(): StatutoryBenefitReviewClient {
  return {
    list: vi.fn().mockResolvedValue(queueValue),
    get: vi.fn().mockResolvedValue({ ...detail, idDocumentType: "PWD ID", issuingAuthority: "City social welfare office", expiryDate: "2027-08-24", maskedIdReference: "***1234", submissionReason: "PITX parking privilege request" }),
    evidence: vi.fn().mockResolvedValue({ contractVersion: statutoryBenefitReviewContractVersion, decisionCommandReference: reference, evidenceRequired: true, evidenceRecorded: true, items: [{ evidenceType: "GOVERNMENT_ID", captureMethod: "UPLOAD", maskedReference: "***1234", verificationStatus: "RECORDED", previewPermitted: false }], correlationId: queueValue.correlationId }),
    evidencePreview: vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/jpeg" })),
    decide: vi.fn().mockResolvedValue({}),
    clearRuntimeState: vi.fn()
  };
}

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatutoryBenefitReviewPage } from "./StatutoryBenefitReviewPage";
import { normalizeIdControlReference, parseDetail, parseQueue, statutoryBenefitReviewContractVersion, toSafeMaskedIdReference, type StatutoryBenefitReviewClient, type StatutoryBenefitReviewQueue } from "./statutoryBenefitReview";

const site = { siteId: "10000000-0000-4000-8000-000000000001", displayName: "SITE-A" };
const reference = "20000000-0000-4000-8000-000000000001";
const queueValue: StatutoryBenefitReviewQueue = {
  contractVersion: statutoryBenefitReviewContractVersion,
  items: [{ requestReference: "30000000-0000-4000-8000-000000000001", decisionCommandReference: reference, parkingSessionReference: "40000000-0000-4000-8000-000000000001", ticketReference: "SAFE-001", siteReference: site.siteId, siteCode: "SITE-A", siteName: "SITE-A", sourceChannel: "WEBPAY", benefitType: "PWD", status: "PENDING_REVIEW", evidenceRequired: true, evidenceRecorded: true, submittedAt: "2026-08-24T01:00:00Z" }],
  page: 1, pageSize: 25, totalCount: 1, hasMore: false, correlationId: "50000000-0000-4000-8000-000000000001"
};
const detail = { ...queueValue.items[0], contractVersion: statutoryBenefitReviewContractVersion, requesterAttestation: true, beneficiaryResidencySatisfied: true, hasAuthoritativeIdControlReference: false, money: { originalAmountMinorUnits: 123456, discountAmountMinorUnits: 24691, finalPayableAmountMinorUnits: 108765, currency: "PHP" as const }, version: 7 };

describe("Statutory Benefit Requests", () => {
  it("parses the stable contract and rejects non-PHP money", () => {
    expect(parseQueue(queueValue).items[0].status).toBe("PENDING_REVIEW");
    expect(() => parseDetail({ ...detail, money: { ...detail.money, currency: "USD" } })).toThrow(/PHP/);
  });

  it("loads pending by default, renders identifiable queue facts without the evidence notice", async () => {
    const client = makeClient();
    renderPage(client);
    expect(await screen.findByText("Person with disability")).toBeInTheDocument();
    expect(client.list).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING", page: 1, pageSize: 25 }), expect.any(AbortSignal));
    fireEvent.click(screen.getByRole("button", { name: /Person with disability/ }));
    expect(await screen.findByText("₱1,234.56")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evidence privacy notice")).not.toBeInTheDocument();
    expect(screen.getAllByText("Ticket SAFE-001")[0]).toHaveClass("detailTicket");
    expect(screen.getByText("Site: SITE-A")).toBeInTheDocument();
    expect(screen.getByText("Channel: WebPay")).toBeInTheDocument();
    expect(screen.getByText(/Submitted:/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByText("PWD ID")).toBeInTheDocument();
    expect(screen.getByLabelText(/Issuing authority/)).toHaveValue("City social welfare office");
    expect(screen.getByLabelText("ID No. / Control No.")).toHaveValue("****5678");
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
    expect(screen.getByText("Residency attestation")).toBeInTheDocument();
  });

  it("shows Not recorded instead of substituting the parking session when a ticket is absent", async () => {
    const client = makeClient();
    vi.mocked(client.list).mockResolvedValue({
      ...queueValue,
      items: [{ ...queueValue.items[0], ticketReference: undefined }]
    });

    renderPage(client);

    expect(await screen.findByText("Ticket: Not recorded")).toBeInTheDocument();
    expect(screen.queryByText(`Ticket: ${queueValue.items[0].parkingSessionReference}`)).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Enlarge statutory entitlement evidence" }));
    const dialog = screen.getByRole("dialog", { name: "Enlarged statutory entitlement evidence" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByAltText("Enlarged statutory entitlement evidence")).toHaveAttribute("src", "blob:review-preview");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Enlarged statutory entitlement evidence" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enlarge statutory entitlement evidence" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Enlarged statutory entitlement evidence" })).not.toBeInTheDocument();
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

  it("submits the complete normalized reviewer ID and masks it only in finalized presentation", async () => {
    const client = makeClient();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));

    expect(await screen.findByLabelText(/ID document type/)).toBeEnabled();
    expect(screen.getByLabelText(/Issuing authority/)).toBeEnabled();
    expect(screen.getByLabelText(/Expiry date/)).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByLabelText("ID No. / Control No.")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("ID No. / Control No."), { target: { value: "12345678" } });
    fireEvent.blur(screen.getByLabelText("ID No. / Control No."));
    expect(screen.getByLabelText("ID No. / Control No.")).toHaveValue("****5678");
    fireEvent.focus(screen.getByLabelText("ID No. / Control No."));
    expect(screen.getByLabelText("ID No. / Control No.")).toHaveValue("12345678");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(client.decide).toHaveBeenCalledWith(reference, expect.objectContaining({
      decision: "APPROVE",
      idDocumentType: "PWD_ID",
      issuingAuthority: "City social welfare office",
      expiryDate: "2027-08-24",
      idControlReference: "12345678"
    })));
    expect(JSON.stringify(vi.mocked(client.decide).mock.calls)).not.toContain("****5678");
  });

  it("marks every approval field as required and reports each missing value inline", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ ...detail });
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));

    expect(await screen.findByText("All ID details are required before approval.")).toBeInTheDocument();
    for (const label of ["ID document type", "Issuing authority", "Expiry date", "ID No. / Control No."]) {
      const input = screen.getByLabelText(new RegExp(`^${label}`));
      const fieldLabel = document.querySelector(`label[for="${input.id}"] .reviewFieldLabel`);
      expect(fieldLabel).toHaveTextContent(`${label} *`);
      expect(input).toHaveAttribute("aria-required", "true");
    }

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Select the ID document type.")).toBeInTheDocument();
    expect(screen.getByText("Enter the issuing authority.")).toBeInTheDocument();
    expect(screen.getByText("Enter the expiry date.")).toBeInTheDocument();
    expect(screen.getByText("Enter at least 4 characters.")).toBeInTheDocument();
    expect(client.decide).not.toHaveBeenCalled();
  });

  it("leaves empty reviewer fields and rejection reason genuinely empty without placeholders", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ ...detail });
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    await screen.findByRole("heading", { name: "Record decision" });

    expect(screen.getByLabelText(/ID document type/)).toHaveValue("");
    expect(screen.getByLabelText(/Issuing authority/)).toHaveValue("");
    expect(screen.getByLabelText(/Expiry date/)).toHaveValue("");
    expect(screen.getByLabelText("ID No. / Control No.")).toHaveValue("");
    expect(screen.getByLabelText("Rejection reason")).toHaveValue("");
    expect(screen.getByLabelText(/Issuing authority/)).not.toHaveAttribute("placeholder");
    expect(screen.getByLabelText("ID No. / Control No.")).not.toHaveAttribute("placeholder");
    expect(screen.getByLabelText("Rejection reason")).not.toHaveAttribute("placeholder");
    expect(screen.getByText("Rejection reason is required only when rejecting.")).toBeInTheDocument();
  });

  it("retains an unchanged authoritative ID server-side without submitting its mask", async () => {
    const client = makeClient();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    await screen.findByRole("heading", { name: "Record decision" });

    expect(screen.getByLabelText("ID No. / Control No.")).toHaveValue("****5678");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(client.decide).toHaveBeenCalled());
    const submitted = vi.mocked(client.decide).mock.calls[0][1];
    expect(submitted.idControlReference).toBeUndefined();
    expect(JSON.stringify(submitted)).not.toContain("****5678");
  });

  it("submits only the rejection reason when approval metadata is empty", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({ ...detail });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    await screen.findByRole("heading", { name: "Record decision" });
    fireEvent.change(screen.getByLabelText("Rejection reason"), { target: { value: "IDENTITY_NOT_VERIFIABLE" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(client.decide).toHaveBeenCalled());
    const submitted = vi.mocked(client.decide).mock.calls[0][1];
    expect(submitted).toMatchObject({ decision: "REJECT", rejectionReason: "IDENTITY_NOT_VERIFIABLE" });
    expect(submitted.idDocumentType).toBeUndefined();
    expect(submitted.issuingAuthority).toBeUndefined();
    expect(submitted.expiryDate).toBeUndefined();
    expect(submitted.idControlReference).toBeUndefined();
  });

  it("accepts an exact four-character safe reference without masking the last four", () => {
    expect(toSafeMaskedIdReference("8764")).toBe("8764");
    expect(toSafeMaskedIdReference("ABC12345")).toBe("****2345");
    expect(normalizeIdControlReference(" 12345678 ")).toBe("12345678");
    expect(() => normalizeIdControlReference("123")).toThrow(/at least 4/);
  });

  it("shows finalized reviewed metadata masked and never renders the raw ID", async () => {
    const client = makeClient();
    vi.mocked(client.get).mockResolvedValue({
      ...detail,
      status: "APPROVED",
      idDocumentType: "PWD_ID",
      issuingAuthority: "City social welfare office",
      expiryDate: "2027-08-24",
      maskedIdReference: "****5678",
      hasAuthoritativeIdControlReference: true,
      decision: { decision: "APPROVE", reviewerDisplayName: "Reviewer", decidedAt: "2026-08-24T01:05:00Z" }
    });
    const view = renderPage(client);
    fireEvent.click(await screen.findByRole("button", { name: /Person with disability/ }));
    expect(await screen.findByText("****5678")).toBeInTheDocument();
    expect(view.container).not.toHaveTextContent("12345678");
    expect(screen.queryByLabelText("ID No. / Control No.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("retains the controlled conflict after refreshing authoritative detail", async () => {
    const client = makeClient();
    vi.mocked(client.list)
      .mockResolvedValueOnce(queueValue)
      .mockResolvedValueOnce({ ...queueValue, items: [], totalCount: 0 });
    vi.mocked(client.get)
      .mockResolvedValueOnce({ ...detail, idDocumentType: "PWD_ID", issuingAuthority: "City social welfare office", expiryDate: "2027-08-24", maskedIdReference: "***1234", hasAuthoritativeIdControlReference: true })
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
    fireEvent.click(await screen.findByRole("button", { name: "Change" }));
    fireEvent.change(screen.getByLabelText("ID No. / Control No."), { target: { value: "ABC1234" } });
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
    get: vi.fn().mockResolvedValue({ ...detail, idDocumentType: "PWD_ID", issuingAuthority: "City social welfare office", expiryDate: "2027-08-24", maskedIdReference: "****5678", hasAuthoritativeIdControlReference: true, submissionReason: "PITX parking privilege request" }),
    evidence: vi.fn().mockResolvedValue({ contractVersion: statutoryBenefitReviewContractVersion, decisionCommandReference: reference, evidenceRequired: true, evidenceRecorded: true, items: [{ evidenceType: "GOVERNMENT_ID", captureMethod: "UPLOAD", maskedReference: "***1234", verificationStatus: "RECORDED", previewPermitted: false }], correlationId: queueValue.correlationId }),
    evidencePreview: vi.fn().mockResolvedValue(new Blob(["image"], { type: "image/jpeg" })),
    decide: vi.fn().mockResolvedValue({}),
    clearRuntimeState: vi.fn()
  };
}

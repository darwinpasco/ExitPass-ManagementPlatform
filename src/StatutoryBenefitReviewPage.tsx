import { useEffect, useRef, useState } from "react";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";
import { normalizeIdControlReference, toSafeMaskedIdReference, type StatutoryBenefitEvidence, type StatutoryBenefitReviewClient, type StatutoryBenefitReviewDetail, type StatutoryBenefitReviewFilters, type StatutoryBenefitReviewQueue } from "./statutoryBenefitReview";

interface Props {
  client: StatutoryBenefitReviewClient;
  authorizedSites: readonly ManagementPlatformSite[];
  canViewDetail: boolean;
  canViewEvidence: boolean;
  canApprove: boolean;
  canReject: boolean;
}

const initialFilters: StatutoryBenefitReviewFilters = { status: "PENDING", page: 1, pageSize: 25 };

interface ReviewedDocumentDraft {
  idDocumentType: string;
  issuingAuthority: string;
  expiryDate: string;
  idReference: string;
  maskedIdReference: string;
  hasAuthoritativeIdReference: boolean;
  replaceIdReference: boolean;
}

type ApprovalFieldName = "idDocumentType" | "issuingAuthority" | "expiryDate" | "idReference";
type ApprovalFieldErrors = Partial<Record<ApprovalFieldName, string>>;

export function StatutoryBenefitReviewPage({ client, authorizedSites, canViewDetail, canViewEvidence, canApprove, canReject }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [draftSearch, setDraftSearch] = useState("");
  const [queue, setQueue] = useState<StatutoryBenefitReviewQueue>();
  const [detail, setDetail] = useState<StatutoryBenefitReviewDetail>();
  const [evidence, setEvidence] = useState<StatutoryBenefitEvidence>();
  const [evidenceError, setEvidenceError] = useState<ManagementPlatformUiError>();
  const [error, setError] = useState<ManagementPlatformUiError>();
  const [loading, setLoading] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notice, setNotice] = useState<string>();
  const [approvalFieldErrors, setApprovalFieldErrors] = useState<ApprovalFieldErrors>({});
  const requestSequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError(undefined);
    void client.list(filters, controller.signal).then((value) => {
      if (sequence !== requestSequence.current) return;
      setQueue(value);
    }).catch((reason: unknown) => {
      if (sequence !== requestSequence.current || isCancelled(reason)) return;
      setError(asError(reason));
    }).finally(() => {
      if (sequence === requestSequence.current) setLoading(false);
    });
    return () => controller.abort();
  }, [client, filters]);

  async function open(reference: string) {
    if (!canViewDetail) return;
    const sequence = ++requestSequence.current;
    setLoading(true); setError(undefined); setEvidence(undefined); setEvidenceError(undefined); setNotice(undefined);
    try {
      const value = await client.get(reference);
      if (sequence !== requestSequence.current) return;
      setDetail(value);
      if (canViewEvidence) {
        try { setEvidence(await client.evidence(reference)); }
        catch (reason) { if (sequence === requestSequence.current) setEvidenceError(asError(reason)); }
      }
    } catch (reason) {
      if (sequence === requestSequence.current) setError(asError(reason));
    } finally { if (sequence === requestSequence.current) setLoading(false); }
  }

  async function refreshQueue() {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const value = await client.list(filters);
      if (sequence === requestSequence.current) setQueue(value);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }

  async function decide(decision: "APPROVE" | "REJECT", reviewedDocument: ReviewedDocumentDraft) {
    if (!detail || decisionPending) return;
    const reason = rejectionReason.trim();
    if (decision === "REJECT" && !reason) {
      setError({ kind: "validation", code: "STATUTORY_BENEFIT_REJECTION_REASON_REQUIRED", message: "Enter a rejection reason before submitting.", retryable: false, mutationUncertain: false });
      return;
    }
    const idDocumentType = reviewedDocument.idDocumentType.trim();
    const issuingAuthority = reviewedDocument.issuingAuthority.trim();
    let idControlReference: string | undefined;
    const fieldErrors: ApprovalFieldErrors = {};
    if (decision === "APPROVE") {
      if (!idDocumentType) fieldErrors.idDocumentType = "Select the ID document type.";
      if (!issuingAuthority) fieldErrors.issuingAuthority = "Enter the issuing authority.";
      if (!reviewedDocument.expiryDate) fieldErrors.expiryDate = "Enter the expiry date.";
      if (reviewedDocument.replaceIdReference || !reviewedDocument.hasAuthoritativeIdReference) {
        try { idControlReference = normalizeIdControlReference(reviewedDocument.idReference); }
        catch { fieldErrors.idReference = "Enter at least 4 characters."; }
        if (!idControlReference) fieldErrors.idReference = "Enter at least 4 characters.";
      }
      if (Object.keys(fieldErrors).length) {
        setApprovalFieldErrors(fieldErrors);
        const first = (["idDocumentType", "issuingAuthority", "expiryDate", "idReference"] as const).find((name) => fieldErrors[name]);
        if (first) requestAnimationFrame(() => document.getElementById(`review-${first}`)?.focus());
        return;
      }
    }
    setApprovalFieldErrors({});
    const confirmed = window.confirm(decision === "APPROVE"
      ? "Approve this statutory-benefit request? Central PMS will apply the governed payable basis."
      : "Reject this statutory-benefit request with the entered reason?");
    if (!confirmed) return;
    setDecisionPending(true); setError(undefined);
    try {
      await client.decide(detail.decisionCommandReference, {
        decision,
        rejectionReason: decision === "REJECT" ? reason : undefined,
        expectedVersion: detail.version,
        idempotencyKey: crypto.randomUUID(),
        idDocumentType: decision === "APPROVE" ? idDocumentType || undefined : undefined,
        issuingAuthority: decision === "APPROVE" ? issuingAuthority || undefined : undefined,
        expiryDate: decision === "APPROVE" ? reviewedDocument.expiryDate || undefined : undefined,
        idControlReference: decision === "APPROVE" ? idControlReference : undefined
      });
      setNotice(`Request ${decision === "APPROVE" ? "approved" : "rejected"}. Central PMS recorded the final decision.`);
      setRejectionReason("");
      await open(detail.decisionCommandReference);
      setFilters((current) => ({ ...current, page: 1 }));
    } catch (reasonValue) {
      const next = asError(reasonValue);
      if (next.kind === "conflict") {
        await open(detail.decisionCommandReference);
        await refreshQueue();
      }
      setError(next);
    } finally { setDecisionPending(false); }
  }

  const start = queue && queue.totalCount ? (queue.page - 1) * queue.pageSize + 1 : 0;
  const end = queue ? Math.min(queue.page * queue.pageSize, queue.totalCount) : 0;

  return (
    <section className="statutoryReviewPage" aria-labelledby="statutory-review-title">
      <header className="reportPageHeader">
        <div><p className="eyebrow">Head Office review</p><h2 id="statutory-review-title">Statutory Benefit Requests</h2><p>Review WebPay and APT requests held by Central PMS across your explicitly authorized Sites.</p></div>
      </header>
      <form className="reviewFilters" aria-label="Statutory benefit request filters" onSubmit={(event) => { event.preventDefault(); setFilters((current) => ({ ...current, search: draftSearch.trim() || undefined, page: 1 })); }}>
        <label>Status<select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as StatutoryBenefitReviewFilters["status"], page: 1 }))}><option value="PENDING">Pending</option><option value="ALL">All</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label>
        <label>Site<select value={filters.siteReference ?? ""} onChange={(event) => setFilters((current) => ({ ...current, siteReference: event.target.value || undefined, page: 1 }))}><option value="">All authorized Sites</option>{authorizedSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.displayName}</option>)}</select></label>
        <label>Originating channel<select value={filters.sourceChannel ?? ""} onChange={(event) => setFilters((current) => ({ ...current, sourceChannel: event.target.value as StatutoryBenefitReviewFilters["sourceChannel"] || undefined, page: 1 }))}><option value="">All channels</option><option value="WEBPAY">WebPay</option><option value="ASSISTED_PAYMENT_TERMINAL">APT</option></select></label>
        <label>Benefit type<select value={filters.benefitType ?? ""} onChange={(event) => setFilters((current) => ({ ...current, benefitType: event.target.value as StatutoryBenefitReviewFilters["benefitType"] || undefined, page: 1 }))}><option value="">All types</option><option value="SENIOR_CITIZEN">Senior citizen</option><option value="PWD">Person with disability</option></select></label>
        <label>Submitted from<input type="datetime-local" value={toLocalInput(filters.submittedFrom)} onChange={(event) => setFilters((current) => ({ ...current, submittedFrom: toUtc(event.target.value), page: 1 }))} /></label>
        <label>Submitted before<input type="datetime-local" value={toLocalInput(filters.submittedTo)} onChange={(event) => setFilters((current) => ({ ...current, submittedTo: toUtc(event.target.value), page: 1 }))} /></label>
        <label className="reviewSearch">Safe reference search<input value={draftSearch} maxLength={160} placeholder="Request, parking session, or ticket reference" onChange={(event) => setDraftSearch(event.target.value)} /></label>
        <button type="submit" className="primaryButton">Search</button>
      </form>

      {loading && <div className="stateMessage" role="status"><h3>Loading requests</h3><p>Reading authoritative review state from Central PMS.</p></div>}
      {error && <ReviewError error={error} />}
      {notice && <div className="stateMessage" role="status"><h3>Decision recorded</h3><p>{notice}</p></div>}

      <div className={`reviewMasterDetail ${detail ? "hasDetail" : ""}`}>
        {detail && <ReviewDetail client={client} detail={detail} evidence={evidence} evidenceError={evidenceError} canViewEvidence={canViewEvidence} canApprove={canApprove} canReject={canReject} pending={decisionPending} rejectionReason={rejectionReason} approvalFieldErrors={approvalFieldErrors} onReason={setRejectionReason} onDecision={decide} onClose={() => { setDetail(undefined); setEvidence(undefined); setEvidenceError(undefined); setError(undefined); setApprovalFieldErrors({}); }} />}
        <section className="reviewDirectory" aria-labelledby="review-directory-title">
          <div className="panelHeader"><div><p className="eyebrow">Authoritative queue</p><h3 id="review-directory-title">Requests</h3></div>{queue && <span>{start}-{end} of {queue.totalCount}</span>}</div>
          {queue?.items.length === 0 && <div className="stateMessage" role="status"><h4>No requests found</h4><p>No statutory-benefit requests match the current authorized filters.</p></div>}
          <div className="reviewList">{queue?.items.map((item) => <button key={item.decisionCommandReference} type="button" className="reviewListItem" onClick={() => void open(item.decisionCommandReference)} disabled={!canViewDetail}><span className="reviewListIdentity"><strong className="ticketPrimary">{item.ticketReference ? `Ticket ${item.ticketReference}` : "Ticket: Not recorded"}</strong><small>Site: {item.siteName}</small><small>Channel: {channelLabel(item.sourceChannel)}</small><small>Submitted: {formatTime(item.submittedAt)}</small><small className="discountType">Discount type: {benefitLabel(item.benefitType)}</small></span><span><b className={`statusBadge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</b></span></button>)}</div>
          {queue && <div className="paginationControls"><button type="button" className="secondaryButton" disabled={queue.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {queue.page}</span><button type="button" className="secondaryButton" disabled={!queue.hasMore} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div>}
        </section>
      </div>
    </section>
  );
}

function ReviewDetail({ client, detail, evidence, evidenceError, canViewEvidence, canApprove, canReject, pending, rejectionReason, approvalFieldErrors, onReason, onDecision, onClose }: { client: StatutoryBenefitReviewClient; detail: StatutoryBenefitReviewDetail; evidence?: StatutoryBenefitEvidence; evidenceError?: ManagementPlatformUiError; canViewEvidence: boolean; canApprove: boolean; canReject: boolean; pending: boolean; rejectionReason: string; approvalFieldErrors: ApprovalFieldErrors; onReason: (value: string) => void; onDecision: (value: "APPROVE" | "REJECT", reviewedDocument: ReviewedDocumentDraft) => void; onClose: () => void }) {
  const isPending = detail.status === "PENDING_REVIEW";
  const [reviewedDocument, setReviewedDocument] = useState<ReviewedDocumentDraft>(() => toReviewedDocumentDraft(detail));
  const [idReferenceFocused, setIdReferenceFocused] = useState(false);
  useEffect(() => { setReviewedDocument(toReviewedDocumentDraft(detail)); setIdReferenceFocused(false); }, [detail.decisionCommandReference, detail.version]);
  return <section className="reviewDetail" aria-labelledby="review-detail-title" tabIndex={-1}>
    <div className="panelHeader"><div><p className="eyebrow">Request detail</p><h3 id="review-detail-title" className="detailTicket">{detail.ticketReference ? `Ticket ${detail.ticketReference}` : "Ticket: Not recorded"}</h3></div><button type="button" className="secondaryButton" onClick={onClose}>Close</button></div>
    <dl className="detailGrid"><dt>Site</dt><dd>{detail.siteName} ({detail.siteCode})</dd><dt>Originating channel</dt><dd>{channelLabel(detail.sourceChannel)}</dd><dt>Parking session</dt><dd>{detail.parkingSessionReference}</dd><dt>Request reference</dt><dd>{detail.requestReference}</dd><dt>Submitted</dt><dd>{formatTime(detail.submittedAt)}</dd><dt>Status</dt><dd>{statusLabel(detail.status)}</dd><dt>Discount type</dt><dd>{benefitLabel(detail.benefitType)}</dd>{!isPending && <><dt>ID document type</dt><dd>{displaySafeValue(detail.idDocumentType)}</dd><dt>Issuing authority</dt><dd>{displaySafeValue(detail.issuingAuthority)}</dd><dt>Expiry date</dt><dd>{detail.expiryDate ?? "Not recorded"}</dd><dt>ID No. / Control No.</dt><dd>{displaySafeValue(detail.maskedIdReference)}</dd></>}<dt>Requester attestation</dt><dd>{detail.requesterAttestation ? "Confirmed" : "Not confirmed"}</dd>{detail.beneficiaryResidencySatisfied !== undefined && <><dt>Residency attestation</dt><dd>{detail.beneficiaryResidencySatisfied ? "Confirmed" : "Not confirmed"}</dd></>}{detail.submissionReason && <><dt>Submitted note</dt><dd>{detail.submissionReason}</dd></>}{detail.money && <><dt>Original amount</dt><dd>{formatPhp(detail.money.originalAmountMinorUnits)}</dd><dt>Statutory benefit</dt><dd>{formatPhp(detail.money.discountAmountMinorUnits)}</dd><dt>Final payable amount</dt><dd>{formatPhp(detail.money.finalPayableAmountMinorUnits)}</dd></>}</dl>
    <section aria-labelledby="evidence-title"><h4 id="evidence-title">Evidence for review</h4>{evidenceError ? <EvidenceLoadError error={evidenceError} /> : !canViewEvidence ? <p>Evidence is not available for this session.</p> : !evidence ? <p role="status">Loading authoritative evidence metadata...</p> : evidence.items.length === 0 ? <p>No current reviewable evidence is recorded.</p> : <ul className="evidenceList">{evidence.items.map((item, index) => <li key={item.evidenceItemReference ?? `${item.evidenceType}-${index}`}><strong>{(item.documentType ?? item.evidenceType).replaceAll("_", " ")}</strong><span>Status: {item.reviewabilityStatus ?? item.verificationStatus ?? "Unavailable"}</span>{item.itemRole && <small>Role: {item.itemRole.replaceAll("_", " ")}</small>}{item.contentType && <small>Media: {item.contentType}</small>}{item.maskedReference && <small>ID: {item.maskedReference}</small>}<small>Upload: {item.uploadStatus ?? "Unavailable"}</small><small>Validation: {item.validationStatus ?? "Unavailable"}</small><small>Malware scan: {item.malwareScanStatus ?? "Unavailable"}</small>{item.reviewableAt && <small>Reviewable at {formatTime(item.reviewableAt)}</small>}{item.previewPermitted && item.evidenceItemReference && <EvidencePreview client={client} decisionReference={detail.decisionCommandReference} evidenceItemReference={item.evidenceItemReference} />}</li>)}</ul>}</section>
    {detail.decision && <section className="decisionSummary"><h4>Final decision</h4><p><strong>{detail.decision.decision === "APPROVE" ? "Approved" : "Rejected"}</strong> by {detail.decision.reviewerDisplayName} at {formatTime(detail.decision.decidedAt)}.</p>{detail.decision.reason && <p>Reason: {detail.decision.reason}</p>}</section>}
    {isPending && (canApprove || canReject) && <section className="decisionPanel" aria-labelledby="decision-title">
      <h4 id="decision-title">Record decision</h4>
      <p>All ID details are required before approval.</p>
      <p className="fieldGuidance">ID details are required for approval. A rejection requires only a rejection reason.</p>
      <div className="reviewMetadataFields">
        <label htmlFor="review-idDocumentType"><span className="reviewFieldLabel">ID document type <span aria-hidden="true">*</span></span><select id="review-idDocumentType" required aria-required="true" value={reviewedDocument.idDocumentType} aria-invalid={Boolean(approvalFieldErrors.idDocumentType)} aria-describedby={approvalFieldErrors.idDocumentType ? "review-idDocumentType-error" : undefined} onChange={(event) => setReviewedDocument((current) => ({ ...current, idDocumentType: event.target.value }))}><option value="">Select document type</option><option value="SENIOR_CITIZEN_ID">Senior Citizen ID</option><option value="PWD_ID">PWD ID</option><option value="OTHER_SUPPORTING_DOCUMENT">Other supporting document</option></select>{approvalFieldErrors.idDocumentType && <small id="review-idDocumentType-error" className="fieldError">{approvalFieldErrors.idDocumentType}</small>}</label>
        <label htmlFor="review-issuingAuthority"><span className="reviewFieldLabel">Issuing authority <span aria-hidden="true">*</span></span><input id="review-issuingAuthority" required aria-required="true" value={reviewedDocument.issuingAuthority} maxLength={128} aria-invalid={Boolean(approvalFieldErrors.issuingAuthority)} aria-describedby={approvalFieldErrors.issuingAuthority ? "review-issuingAuthority-error" : undefined} onChange={(event) => setReviewedDocument((current) => ({ ...current, issuingAuthority: event.target.value }))} />{approvalFieldErrors.issuingAuthority && <small id="review-issuingAuthority-error" className="fieldError">{approvalFieldErrors.issuingAuthority}</small>}</label>
        <label htmlFor="review-expiryDate"><span className="reviewFieldLabel">Expiry date <span aria-hidden="true">*</span></span><input id="review-expiryDate" type="date" required aria-required="true" value={reviewedDocument.expiryDate} aria-invalid={Boolean(approvalFieldErrors.expiryDate)} aria-describedby={approvalFieldErrors.expiryDate ? "review-expiryDate-error" : undefined} onChange={(event) => setReviewedDocument((current) => ({ ...current, expiryDate: event.target.value }))} />{approvalFieldErrors.expiryDate && <small id="review-expiryDate-error" className="fieldError">{approvalFieldErrors.expiryDate}</small>}</label>
        <div className="reviewIdField">
          <label htmlFor="review-idReference"><span className="reviewFieldLabel">ID No. / Control No. <span aria-hidden="true">*</span></span></label>
          {reviewedDocument.hasAuthoritativeIdReference && !reviewedDocument.replaceIdReference
            ? <span className="idReferenceExistingRow"><input id="review-idReference" aria-label="ID No. / Control No." aria-required="true" value={reviewedDocument.maskedIdReference} readOnly autoComplete="off" /><button type="button" className="secondaryButton" onClick={() => { setReviewedDocument((current) => ({ ...current, replaceIdReference: true, idReference: "" })); requestAnimationFrame(() => document.getElementById("review-idReference")?.focus()); }}>Change</button></span>
            : <input id="review-idReference" aria-label="ID No. / Control No." required aria-required="true" aria-describedby={approvalFieldErrors.idReference ? "review-id-reference-help review-idReference-error" : "review-id-reference-help"} aria-invalid={Boolean(approvalFieldErrors.idReference)} value={idReferenceFocused ? reviewedDocument.idReference : toSafeMaskedIdReference(reviewedDocument.idReference) ?? ""} minLength={4} maxLength={64} autoComplete="off" onFocus={() => setIdReferenceFocused(true)} onBlur={() => setIdReferenceFocused(false)} onChange={(event) => setReviewedDocument((current) => ({ ...current, idReference: event.target.value }))} />}
          <small id="review-id-reference-help">Enter at least 4 characters. The complete value is retained securely; finalized views show only the last 4 characters.</small>
          {approvalFieldErrors.idReference && <small id="review-idReference-error" className="fieldError">{approvalFieldErrors.idReference}</small>}
        </div>
      </div>
      {canReject && <label htmlFor="review-rejectionReason">Rejection reason<textarea id="review-rejectionReason" value={rejectionReason} maxLength={512} onChange={(event) => onReason(event.target.value)} /></label>}
      {canReject && <p className="fieldGuidance">Rejection reason is required only when rejecting.</p>}
      <div className="decisionActions">{canReject && <button type="button" className="dangerButton" disabled={pending || !rejectionReason.trim()} onClick={() => onDecision("REJECT", reviewedDocument)}>Reject</button>}{canApprove && <button type="button" className="primaryButton" disabled={pending} onClick={() => onDecision("APPROVE", reviewedDocument)}>Approve</button>}</div>
    </section>}
  </section>;
}

function EvidencePreview({ client, decisionReference, evidenceItemReference }: { client: StatutoryBenefitReviewClient; decisionReference: string; evidenceItemReference: string }) {
  const [url, setUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    void client.evidencePreview(decisionReference, evidenceItemReference, controller.signal).then((blob) => {
      if (!controller.signal.aborted) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setPreviewError(asError(reason).message);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, decisionReference, evidenceItemReference]);

  useEffect(() => {
    if (!enlarged) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setEnlarged(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [enlarged]);

  if (previewError) return <p role="alert">{previewError}</p>;
  if (!url) return <p role="status">Loading protected photo...</p>;
  return <><button type="button" className="evidencePreviewButton" onClick={() => setEnlarged(true)} aria-label="Enlarge statutory entitlement evidence"><img className="statutoryEvidencePreview" src={url} alt="Submitted statutory entitlement evidence" /></button>{enlarged && <div className="evidenceLightbox" role="dialog" aria-modal="true" aria-label="Enlarged statutory entitlement evidence" onMouseDown={(event) => { if (event.target === event.currentTarget) setEnlarged(false); }}><div className="evidenceLightboxContent"><button type="button" className="secondaryButton evidenceLightboxClose" onClick={() => setEnlarged(false)}>Close</button><img src={url} alt="Enlarged statutory entitlement evidence" /></div></div>}</>;
}

function EvidenceLoadError({ error }: { error: ManagementPlatformUiError }) {
  return <div className="stateMessage danger" role="alert"><h5>Evidence metadata unavailable</h5><p>{error.message}</p><small>Diagnostic: {error.code}{error.correlationId ? ` | Support reference: ${error.correlationId}` : ""}</small></div>;
}

function ReviewError({ error }: { error: ManagementPlatformUiError }) { const title = error.kind === "conflict" ? "Decision already recorded" : error.kind === "permission-denied" ? "Permission denied" : error.kind === "authentication-required" ? "Authentication required" : error.kind === "integration-unavailable" ? "Review service unavailable" : "Request failed safely"; return <div className="stateMessage danger" role="alert"><h3>{title}</h3><p>{error.message}{error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}</p></div>; }
function asError(value: unknown): ManagementPlatformUiError { return typeof value === "object" && value !== null && "kind" in value ? value as ManagementPlatformUiError : { kind: "unknown", code: "STATUTORY_BENEFIT_REVIEW_FAILED", message: "The request failed safely.", retryable: false, mutationUncertain: false }; }
function isCancelled(value: unknown) { return typeof value === "object" && value !== null && "code" in value && (value as { code?: string }).code === "MANAGEMENT_PLATFORM_REQUEST_CANCELLED"; }
function benefitLabel(value: string) { return value === "PWD" ? "Person with disability" : "Senior citizen"; }
function channelLabel(value: string) { return value === "WEBPAY" ? "WebPay" : "APT"; }
function statusLabel(value: string) { return value === "PENDING_REVIEW" ? "Pending" : value === "APPROVED" ? "Approved" : "Rejected"; }
function displaySafeValue(value?: string) { return value?.trim() || "Not recorded"; }
function toReviewedDocumentDraft(detail: StatutoryBenefitReviewDetail): ReviewedDocumentDraft {
  return {
    idDocumentType: detail.idDocumentType ?? "",
    issuingAuthority: detail.issuingAuthority ?? "",
    expiryDate: detail.expiryDate ?? "",
    idReference: "",
    maskedIdReference: detail.maskedIdReference ?? "",
    hasAuthoritativeIdReference: detail.hasAuthoritativeIdControlReference,
    replaceIdReference: !detail.hasAuthoritativeIdControlReference
  };
}
function formatTime(value: string) { return new Date(value).toLocaleString(); }
function formatPhp(minorUnits: number) { const value = BigInt(minorUnits); const whole = value / 100n; const fraction = (value % 100n).toString().padStart(2, "0"); return `₱${whole.toLocaleString("en-US")}.${fraction}`; }
function toUtc(value: string) { return value ? new Date(value).toISOString() : undefined; }
function toLocalInput(value?: string) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }

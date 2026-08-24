import { useEffect, useRef, useState } from "react";
import type { ManagementPlatformSite, ManagementPlatformUiError } from "./types";
import type { StatutoryBenefitEvidence, StatutoryBenefitReviewClient, StatutoryBenefitReviewDetail, StatutoryBenefitReviewFilters, StatutoryBenefitReviewQueue } from "./statutoryBenefitReview";

interface Props {
  client: StatutoryBenefitReviewClient;
  authorizedSites: readonly ManagementPlatformSite[];
  canViewDetail: boolean;
  canViewEvidence: boolean;
  canApprove: boolean;
  canReject: boolean;
}

const initialFilters: StatutoryBenefitReviewFilters = { status: "PENDING", page: 1, pageSize: 25 };

export function StatutoryBenefitReviewPage({ client, authorizedSites, canViewDetail, canViewEvidence, canApprove, canReject }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [draftSearch, setDraftSearch] = useState("");
  const [queue, setQueue] = useState<StatutoryBenefitReviewQueue>();
  const [detail, setDetail] = useState<StatutoryBenefitReviewDetail>();
  const [evidence, setEvidence] = useState<StatutoryBenefitEvidence>();
  const [error, setError] = useState<ManagementPlatformUiError>();
  const [loading, setLoading] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [notice, setNotice] = useState<string>();
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
    setLoading(true); setError(undefined); setEvidence(undefined); setNotice(undefined);
    try {
      const value = await client.get(reference);
      if (sequence !== requestSequence.current) return;
      setDetail(value);
      if (canViewEvidence) {
        try { setEvidence(await client.evidence(reference)); }
        catch (reason) { if (sequence === requestSequence.current) setError(asError(reason)); }
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

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!detail || decisionPending) return;
    const reason = rejectionReason.trim();
    if (decision === "REJECT" && !reason) {
      setError({ kind: "validation", code: "STATUTORY_BENEFIT_REJECTION_REASON_REQUIRED", message: "Enter a rejection reason before submitting.", retryable: false, mutationUncertain: false });
      return;
    }
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
        idempotencyKey: crypto.randomUUID()
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
      <aside className="reportNotice" aria-label="Evidence privacy notice"><strong>Evidence privacy</strong><p>Evidence is shown only for this authorized review. Do not copy it unnecessarily. Request, evidence, and decision data remain in memory and are cleared when the session ends.</p></aside>

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
        {detail && <ReviewDetail detail={detail} evidence={evidence} canApprove={canApprove} canReject={canReject} pending={decisionPending} rejectionReason={rejectionReason} onReason={setRejectionReason} onDecision={decide} onClose={() => { setDetail(undefined); setEvidence(undefined); setError(undefined); }} />}
        <section className="reviewDirectory" aria-labelledby="review-directory-title">
          <div className="panelHeader"><div><p className="eyebrow">Authoritative queue</p><h3 id="review-directory-title">Requests</h3></div>{queue && <span>{start}-{end} of {queue.totalCount}</span>}</div>
          {queue?.items.length === 0 && <div className="stateMessage" role="status"><h4>No requests found</h4><p>No statutory-benefit requests match the current authorized filters.</p></div>}
          <div className="reviewList">{queue?.items.map((item) => <button key={item.decisionCommandReference} type="button" className="reviewListItem" onClick={() => void open(item.decisionCommandReference)} disabled={!canViewDetail}><span><strong>{benefitLabel(item.benefitType)}</strong><small>{item.siteName} · {channelLabel(item.sourceChannel)}</small></span><span><b className={`statusBadge ${item.status.toLowerCase()}`}>{statusLabel(item.status)}</b><small>{formatTime(item.submittedAt)}</small></span></button>)}</div>
          {queue && <div className="paginationControls"><button type="button" className="secondaryButton" disabled={queue.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button><span>Page {queue.page}</span><button type="button" className="secondaryButton" disabled={!queue.hasMore} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button></div>}
        </section>
      </div>
    </section>
  );
}

function ReviewDetail({ detail, evidence, canApprove, canReject, pending, rejectionReason, onReason, onDecision, onClose }: { detail: StatutoryBenefitReviewDetail; evidence?: StatutoryBenefitEvidence; canApprove: boolean; canReject: boolean; pending: boolean; rejectionReason: string; onReason: (value: string) => void; onDecision: (value: "APPROVE" | "REJECT") => void; onClose: () => void }) {
  const isPending = detail.status === "PENDING_REVIEW";
  return <section className="reviewDetail" aria-labelledby="review-detail-title" tabIndex={-1}>
    <div className="panelHeader"><div><p className="eyebrow">Request detail</p><h3 id="review-detail-title">{benefitLabel(detail.benefitType)}</h3></div><button type="button" className="secondaryButton" onClick={onClose}>Close</button></div>
    <dl className="detailGrid"><dt>Request reference</dt><dd>{detail.requestReference}</dd><dt>Site</dt><dd>{detail.siteName} ({detail.siteCode})</dd><dt>Originating channel</dt><dd>{channelLabel(detail.sourceChannel)}</dd><dt>Parking session</dt><dd>{detail.parkingSessionReference}</dd><dt>Ticket reference</dt><dd>{detail.ticketReference ?? "Not recorded"}</dd><dt>Submitted</dt><dd>{formatTime(detail.submittedAt)}</dd><dt>Status</dt><dd>{statusLabel(detail.status)}</dd>{detail.money && <><dt>Original amount</dt><dd>{formatPhp(detail.money.originalAmountMinorUnits)}</dd><dt>Statutory benefit</dt><dd>{formatPhp(detail.money.discountAmountMinorUnits)}</dd><dt>Final payable amount</dt><dd>{formatPhp(detail.money.finalPayableAmountMinorUnits)}</dd></>}</dl>
    <section aria-labelledby="evidence-title"><h4 id="evidence-title">Evidence for review</h4>{!evidence ? <p>Evidence metadata is unavailable or not permitted for this session.</p> : evidence.items.length === 0 ? <p>No evidence metadata is recorded.</p> : <ul className="evidenceList">{evidence.items.map((item, index) => <li key={`${item.evidenceType}-${index}`}><strong>{item.evidenceType.replaceAll("_", " ")}</strong><span>{item.verificationStatus ?? "Verification status unavailable"}</span>{item.maskedReference && <small>{item.maskedReference}</small>}</li>)}</ul>}</section>
    {detail.decision && <section className="decisionSummary"><h4>Final decision</h4><p><strong>{detail.decision.decision === "APPROVE" ? "Approved" : "Rejected"}</strong> by {detail.decision.reviewerDisplayName} at {formatTime(detail.decision.decidedAt)}.</p>{detail.decision.reason && <p>Reason: {detail.decision.reason}</p>}</section>}
    {isPending && (canApprove || canReject) && <section className="decisionPanel" aria-labelledby="decision-title"><h4 id="decision-title">Record decision</h4>{canReject && <label>Rejection reason<textarea value={rejectionReason} maxLength={512} required onChange={(event) => onReason(event.target.value)} placeholder="Required when rejecting" /></label>}<div className="decisionActions">{canReject && <button type="button" className="dangerButton" disabled={pending || !rejectionReason.trim()} onClick={() => onDecision("REJECT")}>Reject</button>}{canApprove && <button type="button" className="primaryButton" disabled={pending} onClick={() => onDecision("APPROVE")}>Approve</button>}</div></section>}
  </section>;
}

function ReviewError({ error }: { error: ManagementPlatformUiError }) { const title = error.kind === "conflict" ? "Decision already recorded" : error.kind === "permission-denied" ? "Permission denied" : error.kind === "authentication-required" ? "Authentication required" : error.kind === "integration-unavailable" ? "Review service unavailable" : "Request failed safely"; return <div className="stateMessage danger" role="alert"><h3>{title}</h3><p>{error.message}{error.correlationId ? ` Support reference: ${error.correlationId}.` : ""}</p></div>; }
function asError(value: unknown): ManagementPlatformUiError { return typeof value === "object" && value !== null && "kind" in value ? value as ManagementPlatformUiError : { kind: "unknown", code: "STATUTORY_BENEFIT_REVIEW_FAILED", message: "The request failed safely.", retryable: false, mutationUncertain: false }; }
function isCancelled(value: unknown) { return typeof value === "object" && value !== null && "code" in value && (value as { code?: string }).code === "MANAGEMENT_PLATFORM_REQUEST_CANCELLED"; }
function benefitLabel(value: string) { return value === "PWD" ? "Person with disability" : "Senior citizen"; }
function channelLabel(value: string) { return value === "WEBPAY" ? "WebPay" : "APT"; }
function statusLabel(value: string) { return value === "PENDING_REVIEW" ? "Pending" : value === "APPROVED" ? "Approved" : "Rejected"; }
function formatTime(value: string) { return new Date(value).toLocaleString(); }
function formatPhp(minorUnits: number) { const value = BigInt(minorUnits); const whole = value / 100n; const fraction = (value % 100n).toString().padStart(2, "0"); return `₱${whole.toLocaleString("en-US")}.${fraction}`; }
function toUtc(value: string) { return value ? new Date(value).toISOString() : undefined; }
function toLocalInput(value?: string) { if (!value) return ""; const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { AccountLifecycleFrame } from "./AccountLifecycleFrame";
import {
  MfaEnrollmentError,
  createMfaEnrollmentClient,
  type MfaEnrollmentClient,
  type TotpEnrollmentResponse
} from "./mfaEnrollment";
import type { HumanAuthenticationClient, HumanSessionDto } from "./humanAuthentication";

type EnrollmentView =
  | "READY"
  | "ISSUING"
  | "PENDING_RESTART"
  | "SETUP"
  | "CONFIRMING"
  | "SUCCESS"
  | "THROTTLED"
  | "UNAVAILABLE";

interface MfaEnrollmentPageProps {
  session: HumanSessionDto;
  authenticationClient: HumanAuthenticationClient;
  enrollmentClient?: MfaEnrollmentClient;
  onSignIn: (message?: string) => void;
}

export function MfaEnrollmentPage({
  session,
  authenticationClient,
  enrollmentClient: injectedEnrollmentClient,
  onSignIn
}: MfaEnrollmentPageProps) {
  const client = useMemo(
    () => injectedEnrollmentClient ?? createMfaEnrollmentClient(authenticationClient),
    [authenticationClient, injectedEnrollmentClient]
  );
  const [view, setView] = useState<EnrollmentView>("READY");
  const [material, setMaterial] = useState<TotpEnrollmentResponse>();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string>();
  const [logoutWarning, setLogoutWarning] = useState<string>();
  const startButton = useRef<HTMLButtonElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const submitting = view === "ISSUING" || view === "CONFIRMING";

  useEffect(() => {
    document.title = "Authenticator setup | ExitPass";
    startButton.current?.focus();
  }, []);

  useEffect(() => {
    if (view === "SETUP" || view === "THROTTLED") codeInput.current?.focus();
  }, [view]);

  function acceptMaterial(response: TotpEnrollmentResponse) {
    setMaterial(response);
    setCode("");
    setMessage(undefined);
    setView("SETUP");
  }

  function handleError(error: unknown, duringIssue: boolean) {
    const mapped = error instanceof MfaEnrollmentError
      ? error
      : new MfaEnrollmentError("unavailable", "TOTP_ENROLLMENT_UNAVAILABLE", "Authenticator setup is temporarily unavailable. Try again.", true);
    setCode("");
    setMessage(mapped.message);
    if (mapped.kind === "session-ended" || mapped.kind === "not-required" || mapped.kind === "invalid-state") {
      setMaterial(undefined);
      onSignIn(mapped.message);
    } else if (mapped.kind === "pending-exists") {
      setMaterial(undefined);
      setView("PENDING_RESTART");
    } else if (mapped.kind === "invalid-code") {
      setView("SETUP");
    } else if (mapped.kind === "throttled") {
      setView("THROTTLED");
    } else {
      if (duringIssue) setMaterial(undefined);
      setView("UNAVAILABLE");
    }
  }

  async function issue(restart: boolean) {
    if (submitting) return;
    setMessage(undefined);
    setView("ISSUING");
    try {
      acceptMaterial(restart ? await client.restart() : await client.begin());
    } catch (error) {
      handleError(error, true);
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !material) return;
    setMessage(undefined);
    setView("CONFIRMING");
    try {
      await client.confirm(code.trim());
      setMaterial(undefined);
      setCode("");
      setLogoutWarning(undefined);
      try {
        await authenticationClient.logout();
      } catch {
        authenticationClient.clearRuntimeState();
        setLogoutWarning("Sign-out could not be confirmed. The enrollment session remains restricted; sign in again before using the Management Platform.");
      }
      setView("SUCCESS");
    } catch (error) {
      handleError(error, false);
    }
  }

  async function cancel() {
    setMaterial(undefined);
    setCode("");
    try {
      await authenticationClient.logout();
      onSignIn("You have signed out of authenticator setup.");
    } catch {
      authenticationClient.clearRuntimeState();
      onSignIn("Authenticator setup was closed. Sign in again before continuing.");
    }
  }

  if (view === "SUCCESS") {
    return <AccountLifecycleFrame description="Privileged account security">
      <section className="activationState success" aria-labelledby="mfa-enrollment-success-title">
        <p className="eyebrow">Setup complete</p>
        <h2 id="mfa-enrollment-success-title">Authenticator setup complete</h2>
        <p>Your authenticator is active. Sign in again with your username, password, and current authenticator code.</p>
        {logoutWarning && <div className="activationNotice warning" role="alert">{logoutWarning}</div>}
        <button type="button" onClick={() => onSignIn("Authenticator setup is complete. Sign in again.")}>Sign in</button>
      </section>
    </AccountLifecycleFrame>;
  }

  return <AccountLifecycleFrame description="Privileged account security">
    <section className="mfaEnrollment" aria-labelledby="mfa-enrollment-title">
      <div>
        <p className="eyebrow">First privileged sign-in</p>
        <h2 id="mfa-enrollment-title">Set up an authenticator</h2>
        <p>Signed in as <strong>{session.displayName}</strong>. Privileged permissions and site access remain unavailable until setup is confirmed and you sign in again.</p>
      </div>

      {message && <div className={`activationNotice ${view === "UNAVAILABLE" || view === "THROTTLED" ? "warning" : "danger"}`} role="alert">{message}</div>}

      {view === "READY" && <div className="mfaEnrollmentActions">
        <p>Use any standards-compatible authenticator app. A camera is optional because a manual setup secret is also provided.</p>
        <button ref={startButton} type="button" onClick={() => void issue(false)}>Set up authenticator</button>
        <button className="secondaryButton" type="button" onClick={() => void cancel()}>Sign out</button>
      </div>}

      {view === "ISSUING" && <div className="authState" role="status" aria-live="polite">
        <h3>Preparing one-time setup material</h3>
        <p>Keep this page open.</p>
      </div>}

      {view === "PENDING_RESTART" && <div className="mfaEnrollmentActions">
        <p>The previous one-time setup secret cannot be shown again. Restarting safely invalidates it and creates new setup material.</p>
        <button type="button" onClick={() => void issue(true)}>Restart authenticator setup</button>
        <button className="secondaryButton" type="button" onClick={() => void cancel()}>Sign out</button>
      </div>}

      {material && (view === "SETUP" || view === "CONFIRMING" || view === "THROTTLED" || view === "UNAVAILABLE") && <>
        <div className="mfaSetupMaterial">
          <div className="mfaQr" aria-label="Authenticator setup QR code">
            <QRCode value={material.provisioningUri!} size={192} />
          </div>
          <div className="mfaManualSetup">
            <h3>Manual setup</h3>
            <p>If scanning is unavailable, enter this one-time secret in your authenticator app:</p>
            <output aria-label="Manual setup secret">{material.sharedSecret}</output>
            <p>This secret and QR code disappear after confirmation or when you leave setup.</p>
          </div>
        </div>
        <form className="mfaConfirmForm" onSubmit={confirm}>
          <label htmlFor="mfa-enrollment-code">Authenticator code</label>
          <input ref={codeInput} id="mfa-enrollment-code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={submitting} />
          <div className="authActions">
            <button type="submit" disabled={submitting}>{view === "CONFIRMING" ? "Confirming authenticator" : "Confirm authenticator"}</button>
            <button className="secondaryButton" type="button" disabled={submitting} onClick={() => void cancel()}>Cancel and sign out</button>
          </div>
        </form>
      </>}

      {view === "UNAVAILABLE" && !material && <div className="mfaEnrollmentActions">
        <button type="button" onClick={() => void issue(false)}>Retry setup</button>
        <button className="secondaryButton" type="button" onClick={() => void cancel()}>Sign out</button>
      </div>}
    </section>
  </AccountLifecycleFrame>;
}

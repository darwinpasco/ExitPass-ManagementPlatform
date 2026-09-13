import { useEffect, useMemo, useRef, useState } from "react";
import { AccountLifecycleFrame } from "./AccountLifecycleFrame";
import {
  PasswordRecoveryError,
  createPasswordRecoveryClient,
  type PasswordRecoveryClient,
  type PasswordResetMaterial
} from "./passwordRecovery";

type ResetPasswordView = "READY" | "SUBMITTING" | "SUCCESS" | "INVALID_OR_EXPIRED" | "PASSWORD_REJECTED" | "UNAVAILABLE";

interface ResetPasswordPageProps {
  initialMaterial?: PasswordResetMaterial;
  client?: PasswordRecoveryClient;
}

export function ResetPasswordPage({ initialMaterial, client: injectedClient }: ResetPasswordPageProps) {
  const client = useMemo(() => injectedClient ?? createPasswordRecoveryClient(), [injectedClient]);
  const [challengeReference, setChallengeReference] = useState(initialMaterial?.challengeReference ?? "");
  const [challengeSecret, setChallengeSecret] = useState(initialMaterial?.challengeSecret ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [view, setView] = useState<ResetPasswordView>("READY");
  const [message, setMessage] = useState<string>();
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Reset password | ExitPass";
    firstInput.current?.focus();
  }, []);

  function clearSensitiveState() {
    setChallengeReference("");
    setChallengeSecret("");
    setNewPassword("");
    setConfirmation("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === "SUBMITTING") return;
    if (newPassword !== confirmation) {
      setNewPassword("");
      setConfirmation("");
      setMessage("The password confirmation does not match. Enter the new password again.");
      setView("READY");
      return;
    }

    const material = { challengeReference: challengeReference.trim(), challengeSecret: challengeSecret.trim() };
    setMessage(undefined);
    setView("SUBMITTING");
    try {
      await client.resetPassword(material, newPassword);
      clearSensitiveState();
      setView("SUCCESS");
    } catch (error) {
      setNewPassword("");
      setConfirmation("");
      const mapped = error instanceof PasswordRecoveryError
        ? error
        : new PasswordRecoveryError("unavailable", "PASSWORD_RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable. Try again.", true);
      setMessage(mapped.message);
      if (mapped.kind === "password-rejected") {
        setView("PASSWORD_REJECTED");
      } else if (mapped.kind === "unavailable") {
        setView("UNAVAILABLE");
      } else {
        setChallengeReference("");
        setChallengeSecret("");
        setView("INVALID_OR_EXPIRED");
      }
    }
  }

  if (view === "SUCCESS") {
    return <AccountLifecycleFrame description="Secure password recovery">
      <section className="activationState success" aria-labelledby="password-reset-success-title">
        <p className="eyebrow">Recovery complete</p>
        <h2 id="password-reset-success-title">Password reset complete</h2>
        <p>Your password has been changed and existing signed-in sessions were ended. Sign in again with your new password.</p>
        <a className="buttonLink" href="/management-platform/">Sign in</a>
      </section>
    </AccountLifecycleFrame>;
  }

  return <AccountLifecycleFrame description="Secure password recovery">
    <form className="activationForm" aria-labelledby="reset-password-title" onSubmit={submit}>
      <div>
        <p className="eyebrow">Credential recovery</p>
        <h2 id="reset-password-title">Choose a new password</h2>
        <p>Use the password reset link you received, or enter existing canonical reset details.</p>
      </div>
      {(view === "INVALID_OR_EXPIRED" || view === "PASSWORD_REJECTED" || view === "UNAVAILABLE" || message) &&
        <div className={`activationNotice ${view === "UNAVAILABLE" ? "warning" : "danger"}`} role="alert">
          <strong>{view === "PASSWORD_REJECTED" ? "Choose another password" : view === "UNAVAILABLE" ? "Password recovery temporarily unavailable" : view === "INVALID_OR_EXPIRED" ? "Reset details not accepted" : "Check your password"}</strong>
          <span>{message}</span>
          {view === "INVALID_OR_EXPIRED" && <span>Request a new password reset link. If you cannot receive email, contact your administrator.</span>}
        </div>}
      <label htmlFor="password-reset-reference">Reset reference</label>
      <input ref={firstInput} id="password-reset-reference" name="challengeReference" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={challengeReference} onChange={(event) => setChallengeReference(event.target.value)} disabled={view === "SUBMITTING"} />
      <label htmlFor="password-reset-code">Reset code</label>
      <input id="password-reset-code" name="challengeSecret" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={challengeSecret} onChange={(event) => setChallengeSecret(event.target.value)} disabled={view === "SUBMITTING"} />
      <div className="activationPasswordFields">
        <label htmlFor="password-reset-new-password">New password</label>
        <input id="password-reset-new-password" name="newPassword" type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={view === "SUBMITTING"} />
        <label htmlFor="password-reset-confirm-password">Confirm new password</label>
        <input id="password-reset-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={view === "SUBMITTING"} />
      </div>
      <button type="submit" disabled={view === "SUBMITTING"}>{view === "SUBMITTING" ? "Resetting password" : "Reset password"}</button>
      <a className="accountLifecycleBackLink" href="/account/forgot-password">Request a new reset link</a>
      <p className="activationHelp">Reset details and passwords are used only for this reset attempt and are not saved in browser storage.</p>
    </form>
  </AccountLifecycleFrame>;
}

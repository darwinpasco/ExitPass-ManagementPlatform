import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccountActivationError,
  createAccountActivationClient,
  type AccountActivationClient,
  type AccountActivationMaterial
} from "./accountActivation";

type ActivationView = "READY" | "SUBMITTING" | "SUCCESS" | "INVALID_OR_EXPIRED" | "PASSWORD_REJECTED" | "UNAVAILABLE";

interface AccountActivationPageProps {
  initialMaterial?: AccountActivationMaterial;
  client?: AccountActivationClient;
}

export function AccountActivationPage({ initialMaterial, client: injectedClient }: AccountActivationPageProps) {
  const client = useMemo(() => injectedClient ?? createAccountActivationClient(), [injectedClient]);
  const [challengeReference, setChallengeReference] = useState(initialMaterial?.challengeReference ?? "");
  const [challengeSecret, setChallengeSecret] = useState(initialMaterial?.challengeSecret ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [view, setView] = useState<ActivationView>("READY");
  const [message, setMessage] = useState<string>();
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Activate account | ExitPass";
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
      await client.activate(material, newPassword);
      clearSensitiveState();
      setView("SUCCESS");
    } catch (error) {
      setNewPassword("");
      setConfirmation("");
      const mapped = error instanceof AccountActivationError
        ? error
        : new AccountActivationError("unavailable", "ACCOUNT_ACTIVATION_UNAVAILABLE", "Account activation is temporarily unavailable. Try again.", true);
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
    return <ActivationFrame>
      <section className="activationState success" aria-labelledby="activation-success-title">
        <p className="eyebrow">Activation complete</p>
        <h2 id="activation-success-title">Account activated</h2>
        <p>Your password is established. Sign in with your username and new password.</p>
        <a className="buttonLink" href="/management-platform/">Sign in</a>
      </section>
    </ActivationFrame>;
  }

  return <ActivationFrame>
    <form className="activationForm" aria-labelledby="activation-title" onSubmit={submit}>
      <div>
        <p className="eyebrow">First-time account setup</p>
        <h2 id="activation-title">Activate your ExitPass account</h2>
        <p>Use the invitation link or the activation details handed to you, then choose your own password.</p>
      </div>
      {(view === "INVALID_OR_EXPIRED" || view === "PASSWORD_REJECTED" || view === "UNAVAILABLE" || message) &&
        <div className={`activationNotice ${view === "UNAVAILABLE" ? "warning" : "danger"}`} role="alert">
          <strong>{view === "PASSWORD_REJECTED" ? "Choose another password" : view === "UNAVAILABLE" ? "Activation temporarily unavailable" : view === "INVALID_OR_EXPIRED" ? "Activation details not accepted" : "Check your password"}</strong>
          <span>{message}</span>
          {view === "INVALID_OR_EXPIRED" && <span>Ask an authorized administrator or supervisor for a new invitation or activation code.</span>}
        </div>}
      <label htmlFor="activation-reference">Activation reference</label>
      <input ref={firstInput} id="activation-reference" name="challengeReference" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={challengeReference} onChange={(event) => setChallengeReference(event.target.value)} disabled={view === "SUBMITTING"} />
      <label htmlFor="activation-code">Activation code</label>
      <input id="activation-code" name="challengeSecret" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={challengeSecret} onChange={(event) => setChallengeSecret(event.target.value)} disabled={view === "SUBMITTING"} />
      <div className="activationPasswordFields">
        <label htmlFor="activation-password">New password</label>
        <input id="activation-password" name="newPassword" type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={view === "SUBMITTING"} />
        <label htmlFor="activation-confirm-password">Confirm new password</label>
        <input id="activation-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={view === "SUBMITTING"} />
      </div>
      <button type="submit" disabled={view === "SUBMITTING"}>{view === "SUBMITTING" ? "Activating account" : "Activate account"}</button>
      <p className="activationHelp">Activation details and passwords are used only for this activation attempt and are not saved in browser storage.</p>
    </form>
  </ActivationFrame>;
}

function ActivationFrame({ children }: { children: React.ReactNode }) {
  return <main className="accountActivationShell" aria-labelledby="activation-app-title">
    <header className="activationHeader">
      <p className="eyebrow">Employee account access</p>
      <h1 id="activation-app-title">ExitPass</h1>
      <p>Secure account activation</p>
    </header>
    <section className="activationWorkspace">{children}</section>
  </main>;
}

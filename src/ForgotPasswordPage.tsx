import { useEffect, useMemo, useRef, useState } from "react";
import { AccountLifecycleFrame } from "./AccountLifecycleFrame";
import {
  PasswordRecoveryError,
  createPasswordRecoveryClient,
  type PasswordRecoveryClient
} from "./passwordRecovery";

type ForgotPasswordView = "READY" | "SUBMITTING" | "SUCCESS" | "UNAVAILABLE";

export function ForgotPasswordPage({ client: injectedClient }: { client?: PasswordRecoveryClient }) {
  const client = useMemo(() => injectedClient ?? createPasswordRecoveryClient(), [injectedClient]);
  const [username, setUsername] = useState("");
  const [view, setView] = useState<ForgotPasswordView>("READY");
  const [message, setMessage] = useState<string>();
  const usernameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Forgot password | ExitPass";
    usernameInput.current?.focus();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === "SUBMITTING") return;
    setMessage(undefined);
    setView("SUBMITTING");
    try {
      await client.requestReset(username.trim());
      setUsername("");
      setView("SUCCESS");
    } catch (error) {
      const mapped = error instanceof PasswordRecoveryError
        ? error
        : new PasswordRecoveryError("unavailable", "PASSWORD_RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable. Try again.", true);
      setMessage(mapped.message);
      setView("UNAVAILABLE");
    }
  }

  if (view === "SUCCESS") {
    return <AccountLifecycleFrame description="Secure password recovery">
      <section className="activationState success" aria-labelledby="password-request-success-title">
        <p className="eyebrow">Request accepted</p>
        <h2 id="password-request-success-title">Check for a reset link</h2>
        <p>If an eligible ExitPass account with a registered email address matches that username, a password reset link will be sent.</p>
        <p>If you do not receive a reset link, contact your administrator.</p>
        <a className="buttonLink" href="/management-platform/">Back to Sign in</a>
      </section>
    </AccountLifecycleFrame>;
  }

  return <AccountLifecycleFrame description="Secure password recovery">
    <form className="activationForm" aria-labelledby="forgot-password-title" onSubmit={submit}>
      <div>
        <p className="eyebrow">Password help</p>
        <h2 id="forgot-password-title">Forgot password</h2>
        <p>Enter your ExitPass username. The response is the same whether or not an eligible account can receive email.</p>
      </div>
      {view === "UNAVAILABLE" && <div className="activationNotice warning" role="alert">
        <strong>Password recovery temporarily unavailable</strong>
        <span>{message}</span>
      </div>}
      <label htmlFor="password-recovery-username">Username</label>
      <input ref={usernameInput} id="password-recovery-username" name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} disabled={view === "SUBMITTING"} />
      <button type="submit" disabled={view === "SUBMITTING"}>{view === "SUBMITTING" ? "Submitting request" : "Request password reset"}</button>
      <a className="accountLifecycleBackLink" href="/management-platform/">Back to Sign in</a>
    </form>
  </AccountLifecycleFrame>;
}

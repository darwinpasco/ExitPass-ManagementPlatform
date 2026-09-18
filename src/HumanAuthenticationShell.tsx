import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "./App";
import {
  HumanAuthenticationError,
  createHumanAuthenticationClient,
  humanPasswordMinimumLength,
  humanPasswordMinimumMessage,
  isRestrictedSession,
  toManagementPlatformAuthState,
  type HumanAuthenticationClient,
  type HumanAuthenticationResponse,
  type HumanSessionDto
} from "./humanAuthentication";
import type { ManagementPlatformAuthState } from "./types";

type SessionView =
  | { status: "loading" }
  | { status: "login"; message?: string; retryable?: boolean }
  | { status: "password"; mode: "first" | "change" | "forgot" | "expired"; message?: string; session?: HumanSessionDto }
  | { status: "restricted"; session: HumanSessionDto; message: string }
  | { status: "authenticated"; authState: ManagementPlatformAuthState }
  | { status: "unavailable"; message: string };

interface HumanAuthenticationShellProps {
  client?: HumanAuthenticationClient;
}

export function HumanAuthenticationShell({ client: injectedClient }: HumanAuthenticationShellProps) {
  const client = useMemo(() => injectedClient ?? createHumanAuthenticationClient(), [injectedClient]);
  const [view, setView] = useState<SessionView>({ status: "loading" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [expiredTemporaryPassword, setExpiredTemporaryPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const usernameRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);
  const sessionRefreshInFlight = useRef<Promise<void> | undefined>(undefined);

  const clearCredentials = useCallback(() => {
    setPassword("");
    setTotpCode("");
    setNewPassword("");
    setExpiredTemporaryPassword("");
  }, []);

  const enterLogin = useCallback((message?: string) => {
    client.clearRuntimeState();
    clearCredentials();
    setLogoutError(undefined);
    setView({ status: "login", message });
  }, [clearCredentials, client]);

  const applySession = useCallback((response: HumanAuthenticationResponse) => {
    if (!response.authenticated || !response.session) {
      enterLogin();
      return;
    }
    if (response.session.passwordChangeRequired) {
      setUsername(response.session.username);
      setView({ status: "password", mode: "first", session: response.session });
      return;
    }
    if (isRestrictedSession(response.session) || response.session.assurance !== "PASSWORD_TOTP" || !response.session.mfaSatisfied) {
      clearCredentials();
      setView({ status: "restricted", session: response.session, message: "Authenticator verification is required. Contact an authorized administrator to complete governed provisioning." });
      return;
    }
    clearCredentials();
    setView({ status: "authenticated", authState: toManagementPlatformAuthState(response.session) });
  }, [clearCredentials, enterLogin]);

  const readCurrentSession = useCallback(async (signal?: AbortSignal) => {
    const response = await client.getCurrentSession(signal);
    applySession(response);
  }, [applySession, client]);

  const handleSessionReadError = useCallback((error: unknown) => {
    const mapped = asAuthenticationError(error);
    if (isSessionEnded(mapped)) {
      const message = mapped.kind === "session-revoked"
        ? "Your session is no longer active. Sign in again."
        : mapped.kind === "session-expired"
          ? "Your session expired. Sign in again."
          : undefined;
      enterLogin(message);
    } else {
      setView({ status: "unavailable", message: mapped.message });
    }
  }, [enterLogin]);

  useEffect(() => {
    const controller = new AbortController();
    setView({ status: "loading" });
    readCurrentSession(controller.signal).catch((error: unknown) => {
      if (controller.signal.aborted) {
        return;
      }
      handleSessionReadError(error);
    });
    return () => {
      controller.abort();
      client.clearRuntimeState();
      clearCredentials();
    };
  }, [clearCredentials, client, handleSessionReadError, readCurrentSession]);

  useEffect(() => {
    if (view.status === "login") usernameRef.current?.focus();
    if (view.status === "password") totpRef.current?.focus();
  }, [view.status]);

  useEffect(() => {
    if (view.status !== "authenticated" || !view.authState.principal?.sessionExpiresAt) {
      return;
    }
    const expiresIn = Date.parse(view.authState.principal.sessionExpiresAt) - Date.now();
    if (!Number.isFinite(expiresIn)) {
      return;
    }
    if (expiresIn <= 0) {
      enterLogin("Your session expired. Sign in again.");
      return;
    }
    const timer = window.setTimeout(() => enterLogin("Your session expired. Sign in again."), Math.min(expiresIn, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [enterLogin, view]);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setView({ status: "login" });
    try {
      await client.login(username.trim(), password, totpCode.trim());
      await readCurrentSession();
    } catch (error) {
      const mapped = asAuthenticationError(error); setTotpCode("");
      setView({ status: "login", message: mapped.message, retryable: mapped.retryable });
      if (mapped.kind !== "throttled") setPassword("");
    } finally { setSubmitting(false); }
  }

  async function submitPasswordMutation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (view.status !== "password") return;
    if (newPassword.length < humanPasswordMinimumLength) {
      setView({ ...view, message: humanPasswordMinimumMessage });
      return;
    }
    const mode = view.mode; setSubmitting(true); setView({ ...view, message: undefined });
    try {
      const normalizedUsername = username.trim();
      const response = mode === "first" || mode === "change"
        ? await client.changeFirstPassword({ currentPassword: password, totpCode: totpCode.trim(), newPassword })
        : mode === "expired"
          ? await client.resetExpiredTemporaryPassword({ username: normalizedUsername, expiredTemporaryPassword, totpCode: totpCode.trim(), newPassword })
          : await client.resetPassword({ username: normalizedUsername, totpCode: totpCode.trim(), newPassword });
      if (response.outcome !== "PASSWORD_CHANGED" && response.outcome !== "PASSWORD_RESET_COMPLETED") {
        throw new HumanAuthenticationError("malformed-response", "HUMAN_AUTHENTICATION_UNEXPECTED_PASSWORD_RESPONSE", "The password change could not be confirmed safely.");
      }
      enterLogin("Password changed. Sign in with your new password and current authenticator code.");
    } catch (error) {
      const mapped = asAuthenticationError(error); setTotpCode(""); setNewPassword("");
      setView((current) => current.status === "password" ? { ...current, message: mapped.message } : { status: "password", mode, message: mapped.message });
    } finally { setSubmitting(false); }
  }

  async function logout() {
    setLogoutPending(true);
    setLogoutError(undefined);
    try {
      await client.logout();
      enterLogin("You have signed out.");
    } catch (error) {
      const mapped = asAuthenticationError(error);
      if (isSessionEnded(mapped)) {
        enterLogin("Your session is no longer active. Sign in again.");
      } else {
        setLogoutError("Sign out could not be confirmed. Try again before leaving this device.");
      }
    } finally {
      setLogoutPending(false);
    }
  }

  const authenticationLost = useCallback(() => {
    enterLogin("Your session expired or was revoked. Sign in again. Unsaved operations were not replayed.");
  }, [enterLogin]);

  const authenticatedActivity = useCallback(() => {
    if (sessionRefreshInFlight.current) return;
    const refresh = readCurrentSession()
      .catch(handleSessionReadError)
      .finally(() => {
        if (sessionRefreshInFlight.current === refresh) sessionRefreshInFlight.current = undefined;
      });
    sessionRefreshInFlight.current = refresh;
  }, [handleSessionReadError, readCurrentSession]);

  if (view.status === "loading") {
    return <AuthenticationFrame><div className="authState" role="status" aria-live="polite"><h2>Checking your session</h2><p>Confirming your current Management Platform session.</p></div></AuthenticationFrame>;
  }

  if (view.status === "unavailable") {
    return (
      <AuthenticationFrame>
        <div className="authState danger" role="alert" aria-labelledby="auth-unavailable-title">
          <h2 id="auth-unavailable-title">Sign-in service unavailable</h2>
          <p>{view.message}</p>
          <button type="button" onClick={() => { setView({ status: "loading" }); void readCurrentSession().catch(handleSessionReadError); }}>Retry session check</button>
        </div>
      </AuthenticationFrame>
    );
  }

  if (view.status === "login") {
    return (
      <AuthenticationFrame>
        <form className="loginForm" aria-labelledby="login-title" onSubmit={submitLogin}>
          <div><p className="eyebrow">Staff access</p><h2 id="login-title">Sign in</h2><p>Management Platform sign-in requires your username, password, and current authenticator code.</p></div>
          {view.message && <div className="authInlineError" role="alert">{view.message}</div>}
          <label htmlFor="management-platform-username">Username</label>
          <input ref={usernameRef} id="management-platform-username" name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
          <label htmlFor="management-platform-password">Password</label>
          <input id="management-platform-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="management-platform-totp">Authenticator code</label>
          <input ref={totpRef} id="management-platform-totp" name="totpCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} />
          <div className="authActions"><button type="submit" disabled={submitting}>{submitting ? "Signing in" : "Sign in"}</button><button className="linkButton" type="button" disabled={submitting} onClick={() => { clearCredentials(); setView({ status: "password", mode: "forgot" }); }}>Forgot password</button></div>
        </form>
      </AuthenticationFrame>
    );
  }

  if (view.status === "password") {
    const first = view.mode === "first";
    const changing = view.mode === "change";
    const expired = view.mode === "expired";
    const title = first ? "Change temporary password" : changing ? "Change password" : expired ? "Reset an expired temporary password" : "Reset password";
    return (
      <AuthenticationFrame>
        <form className="loginForm" aria-labelledby="password-title" onSubmit={submitPasswordMutation}>
          <div><p className="eyebrow">Password security</p><h2 id="password-title">{title}</h2><p>{first ? "Change your temporary or current password before accessing permitted functions." : changing ? "Enter your current password and authenticator code to set a new password." : expired ? "Use the expired temporary password and your authenticator code to set a new password." : "Use your authenticator code to set a new password for an active account."}</p></div>
          {view.message && <div className="authInlineError" role="alert">{view.message}</div>}
          <label htmlFor="password-username">Username</label><input id="password-username" autoComplete="username" required readOnly={first || changing} value={username} onChange={(event) => setUsername(event.target.value)} />
          {(first || changing) && <><label htmlFor="current-password">{first ? "Temporary or current password" : "Current password"}</label><input id="current-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></>}
          {expired && <><label htmlFor="expired-temporary-password">Expired temporary password</label><input id="expired-temporary-password" type="password" autoComplete="current-password" required value={expiredTemporaryPassword} onChange={(event) => setExpiredTemporaryPassword(event.target.value)} /></>}
          <label htmlFor="password-totp">Authenticator code</label><input ref={totpRef} id="password-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} />
          <label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={humanPasswordMinimumLength} required value={newPassword} onChange={(event) => {
            const value = event.target.value;
            setNewPassword(value);
            if (value.length >= humanPasswordMinimumLength && view.message === humanPasswordMinimumMessage) setView({ ...view, message: undefined });
          }} onInvalid={() => {
            if (newPassword.length < humanPasswordMinimumLength) setView({ ...view, message: humanPasswordMinimumMessage });
          }} />
          <div className="authActions"><button type="submit" disabled={submitting}>{submitting ? "Changing password" : "Change password"}</button>{!first && <button className="secondaryButton" type="button" disabled={submitting} onClick={() => {
            if (changing) {
              clearCredentials();
              setView({ status: "loading" });
              void readCurrentSession().catch(handleSessionReadError);
            } else enterLogin();
          }}>{changing ? "Back to workspace" : "Back to sign in"}</button>}</div>
          {!first && !changing && <button className="linkButton" type="button" disabled={submitting} onClick={() => { setExpiredTemporaryPassword(""); setNewPassword(""); setTotpCode(""); setView({ status: "password", mode: expired ? "forgot" : "expired" }); }}>{expired ? "Reset an active account instead" : "My temporary password expired"}</button>}
        </form>
      </AuthenticationFrame>
    );
  }
  if (view.status === "restricted") {
    return (
      <AuthenticationFrame>
        <section className="authState warning" aria-labelledby="account-action-title">
          <p className="eyebrow">Account action required</p>
          <h2 id="account-action-title">Workspace access is restricted</h2>
          <p>{view.message}</p>
          <p>Signed in as <strong>{view.session.displayName}</strong>.</p>
          {logoutError && <div className="authInlineError" role="alert">{logoutError}</div>}
          <button type="button" disabled={logoutPending} onClick={() => void logout()}>{logoutPending ? "Signing out" : "Sign out"}</button>
        </section>
      </AuthenticationFrame>
    );
  }

  return (
    <>
      {logoutError && <div className="globalAuthError" role="alert">{logoutError}</div>}
      <App
        authState={view.authState}
        developmentScenariosEnabled={false}
        profileScenariosEnabled={false}
        rbacScenariosEnabled={false}
        policyCoverageScenariosEnabled={false}
        evidenceGovernanceScenariosEnabled={false}
        identityAdministrationScenariosEnabled={false}
        dashboardScenariosEnabled={false}
        paymentReconciliationScenariosEnabled={false}
        fiscalExceptionScenariosEnabled={false}
        onAuthenticationRequired={authenticationLost}
        onAuthenticatedActivity={authenticatedActivity}
        authorizeUnsafeRequest={client.authorizeUnsafeRequest}
        onLogout={() => void logout()}
        onChangePassword={() => {
          clearCredentials();
          setUsername(view.authState.principal?.username ?? "");
          setView({ status: "password", mode: "change" });
        }}
        logoutPending={logoutPending}
      />
    </>
  );
}

function AuthenticationFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="authenticationShell" aria-labelledby="authentication-app-title">
      <header className="authenticationHeader">
        <p className="eyebrow">Management Platform</p>
        <h1 id="authentication-app-title">ExitPass Management Platform</h1>
        <p>Governed administration for authorized staff.</p>
      </header>
      <section className="authenticationWorkspace">{children}</section>
    </main>
  );
}

function asAuthenticationError(error: unknown): HumanAuthenticationError {
  if (error instanceof HumanAuthenticationError) {
    return error;
  }
  return new HumanAuthenticationError("unknown", "HUMAN_AUTHENTICATION_UNKNOWN", "The authentication request failed safely.");
}

function isSessionEnded(error: HumanAuthenticationError): boolean {
  return error.kind === "authentication-required" || error.kind === "session-expired" || error.kind === "session-revoked";
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "./App";
import {
  HumanAuthenticationError,
  createHumanAuthenticationClient,
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
  | { status: "totp"; message?: string }
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
  const [submitting, setSubmitting] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string>();
  const usernameRef = useRef<HTMLInputElement>(null);
  const totpRef = useRef<HTMLInputElement>(null);

  const clearCredentials = useCallback(() => {
    setPassword("");
    setTotpCode("");
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
    if (isRestrictedSession(response.session)) {
      const message = response.session.passwordChangeRequired
        ? "A password change is required before this account can use the Management Platform. Use the governed account workflow or contact an authorized administrator."
        : "Authenticator enrollment or verification is required before this account can use privileged Management Platform capabilities.";
      clearCredentials();
      setView({ status: "restricted", session: response.session, message });
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
    if (view.status === "login") {
      usernameRef.current?.focus();
    } else if (view.status === "totp") {
      totpRef.current?.focus();
    }
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
    event.preventDefault();
    setSubmitting(true);
    setView((current) => current.status === "totp" ? { ...current, message: undefined } : { status: "login" });
    try {
      await client.login(username.trim(), password, view.status === "totp" ? totpCode.trim() : undefined);
      await readCurrentSession();
    } catch (error) {
      const mapped = asAuthenticationError(error);
      setTotpCode("");
      if (mapped.kind === "mfa-required" || mapped.kind === "invalid-totp") {
        setView({ status: "totp", message: mapped.kind === "invalid-totp" ? mapped.message : undefined });
      } else {
        setView({ status: "login", message: mapped.message, retryable: mapped.retryable });
        if (mapped.kind !== "throttled") {
          setPassword("");
        }
      }
    } finally {
      setSubmitting(false);
    }
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

  if (view.status === "login" || view.status === "totp") {
    const isTotp = view.status === "totp";
    return (
      <AuthenticationFrame>
        <form className="loginForm" aria-labelledby="login-title" onSubmit={submitLogin}>
          <div>
            <p className="eyebrow">Staff access</p>
            <h2 id="login-title">{isTotp ? "Verification required" : "Sign in"}</h2>
            <p>{isTotp ? "Enter the current code from your authenticator app." : "Use your Management Platform username and password."}</p>
          </div>
          {view.message && <div className="authInlineError" role="alert">{view.message}</div>}
          {!isTotp && (
            <>
              <label htmlFor="management-platform-username">Username</label>
              <input ref={usernameRef} id="management-platform-username" name="username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} />
              <label htmlFor="management-platform-password">Password</label>
              <input id="management-platform-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            </>
          )}
          {isTotp && (
            <>
              <p className="authAccount">Signing in as <strong>{username}</strong></p>
              <label htmlFor="management-platform-totp">Verification code</label>
              <input ref={totpRef} id="management-platform-totp" name="totpCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))} />
            </>
          )}
          <div className="authActions">
            <button type="submit" disabled={submitting}>{submitting ? "Signing in" : isTotp ? "Verify and sign in" : "Sign in"}</button>
            {isTotp && <button className="secondaryButton" type="button" disabled={submitting} onClick={() => { clearCredentials(); setUsername(""); setView({ status: "login" }); }}>Use another account</button>}
          </div>
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
        onAuthenticationRequired={authenticationLost}
        authorizeUnsafeRequest={client.authorizeUnsafeRequest}
        onLogout={() => void logout()}
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

import React from "react";
import ReactDOM from "react-dom/client";
import { AccountActivationPage } from "./AccountActivationPage";
import { accountActivationRoute, captureAccountActivationMaterial, consumeAccountActivationBootstrap } from "./accountActivation";
import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { HumanAuthenticationShell } from "./HumanAuthenticationShell";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { capturePasswordResetMaterial, consumePasswordResetBootstrap, forgotPasswordRoute, resetPasswordRoute } from "./passwordRecovery";
import "./styles.css";

async function start(): Promise<void> {
  const activationRoute = window.location.pathname.replace(/\/+$/, "") === accountActivationRoute;
  const activationMaterial = activationRoute
    ? consumeAccountActivationBootstrap() ?? captureAccountActivationMaterial()
    : undefined;
  const forgotPassword = window.location.pathname.replace(/\/+$/, "") === forgotPasswordRoute;
  const resetPassword = window.location.pathname.replace(/\/+$/, "") === resetPasswordRoute;
  const resetMaterial = resetPassword
    ? consumePasswordResetBootstrap() ?? capturePasswordResetMaterial()
    : undefined;
  const isolatedTestHarness = import.meta.env.MODE === "test-harness"
    && import.meta.env.VITE_MANAGEMENT_PLATFORM_TEST_HARNESS === "isolated-automated-test";
  const root = activationRoute
    ? <AccountActivationPage initialMaterial={activationMaterial} />
    : forgotPassword
    ? <ForgotPasswordPage />
    : resetPassword
    ? <ResetPasswordPage initialMaterial={resetMaterial} />
    : isolatedTestHarness
    ? React.createElement((await import("./test/ManagementPlatformTestHarness")).ManagementPlatformTestHarness)
    : <HumanAuthenticationShell />;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {root}
    </React.StrictMode>
  );
}

void start();

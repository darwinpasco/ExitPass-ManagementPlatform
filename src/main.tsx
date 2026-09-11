import React from "react";
import ReactDOM from "react-dom/client";
import { HumanAuthenticationShell } from "./HumanAuthenticationShell";
import "./styles.css";

async function start(): Promise<void> {
  const isolatedTestHarness = import.meta.env.MODE === "test-harness"
    && import.meta.env.VITE_MANAGEMENT_PLATFORM_TEST_HARNESS === "isolated-automated-test";
  const root = isolatedTestHarness
    ? React.createElement((await import("./test/ManagementPlatformTestHarness")).ManagementPlatformTestHarness)
    : <HumanAuthenticationShell />;

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {root}
    </React.StrictMode>
  );
}

void start();

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { HumanAuthenticationShell } from "./HumanAuthenticationShell";
import { shouldUseDevelopmentScenario } from "./runtimeMode";
import "./styles.css";

const root = shouldUseDevelopmentScenario(import.meta.env.DEV, window.location.search)
  ? <App />
  : <HumanAuthenticationShell />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {root}
  </React.StrictMode>
);

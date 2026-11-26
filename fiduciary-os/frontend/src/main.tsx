import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Workspace styles load first so the scoped funnel sheet wins equal-specificity ties.
import "./styles.css";
import CobaltFunnelShell from "./CobaltFunnelShell";
import Root from "./funnel/Root";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CobaltFunnelShell>
      <Root />
    </CobaltFunnelShell>
  </StrictMode>,
);

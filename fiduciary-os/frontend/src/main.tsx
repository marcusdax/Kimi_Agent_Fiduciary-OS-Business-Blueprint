import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Workspace styles load first so the scoped funnel sheet wins equal-specificity ties.
import "./styles.css";
import Root from "./funnel/Root";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

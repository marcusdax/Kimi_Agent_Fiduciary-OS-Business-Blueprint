import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetSessionSignal } from "./session-signal";
// Sessions live above the router now, so clear them between tests.
afterEach(() => {
  cleanup();
  resetSessionSignal();
});

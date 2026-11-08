import { describe, it, expect, vi, afterEach } from "vitest";
import { api, eventDetails, savedAction } from "./planning-api";
afterEach(() => vi.unstubAllGlobals());
describe("planning API failure handling", () => {
  it("does not retry an ambiguous failed mutation and warns that it may already be saved", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Network failure"));
    vi.stubGlobal("fetch", fetch);
    await expect(
      api(
        "/planning/actions/action/authorization",
        "synthetic-session",
        "POST",
        { version: 1 },
      ),
    ).rejects.toThrow("change may have been saved");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid JSON and malformed records without inventing a successful update", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Not an API</html>")),
    );
    await expect(api("/planning/actions", null)).rejects.toThrow(
      "did not return JSON",
    );
    expect(() => savedAction({})).toThrow("invalid planning record");
  });
  it("renders malformed event details as text instead of crashing", () => {
    expect(eventDetails("Not JSON")).toBe("Not JSON");
  });
});

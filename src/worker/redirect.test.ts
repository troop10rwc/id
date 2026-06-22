import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect.js";

const ROOT = "troop10rwc.org";

describe("safeRedirect", () => {
  it("allows the apex and any subdomain over https", () => {
    expect(safeRedirect("https://troop10rwc.org/x", ROOT)).toBe("https://troop10rwc.org/x");
    expect(safeRedirect("https://calendar.troop10rwc.org/event/5", ROOT)).toBe(
      "https://calendar.troop10rwc.org/event/5",
    );
  });

  it("allows a relative path on our own origin", () => {
    expect(safeRedirect("/profile", ROOT)).toBe("/profile");
  });

  it("falls back for a foreign host (open-redirect attempt)", () => {
    expect(safeRedirect("https://evil.example/phish", ROOT)).toBe("/");
  });

  it("falls back for a look-alike suffix host", () => {
    // nottroop10rwc.org must NOT match troop10rwc.org
    expect(safeRedirect("https://nottroop10rwc.org/x", ROOT)).toBe("/");
    expect(safeRedirect("https://troop10rwc.org.evil.com/x", ROOT)).toBe("/");
  });

  it("falls back for non-https schemes", () => {
    expect(safeRedirect("http://troop10rwc.org/x", ROOT)).toBe("/");
    expect(safeRedirect("javascript:alert(1)", ROOT)).toBe("/");
  });

  it("rejects protocol-relative //host", () => {
    expect(safeRedirect("//evil.example", ROOT)).toBe("/");
  });

  it("falls back for empty / garbage / missing", () => {
    expect(safeRedirect(undefined, ROOT)).toBe("/");
    expect(safeRedirect("", ROOT)).toBe("/");
    expect(safeRedirect("not a url", ROOT)).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirect(null, ROOT, "/login")).toBe("/login");
  });
});

import { describe, expect, it } from "vitest";
import { deviceTokenLabel, parseConnectState } from "./connect.js";

describe("parseConnectState", () => {
  it("accepts a base64url nonce", () => {
    expect(parseConnectState("abcdefghijklmnop_-12")).toBe("abcdefghijklmnop_-12");
  });

  it("rejects missing, short, or non-base64url values", () => {
    expect(parseConnectState(undefined)).toBeNull();
    expect(parseConnectState("short")).toBeNull();
    expect(parseConnectState("abcdefghijklmnop<script>")).toBeNull();
    expect(parseConnectState("a".repeat(129))).toBeNull();
  });
});

describe("deviceTokenLabel", () => {
  it("names known browsers case-insensitively", () => {
    expect(deviceTokenLabel("safari", "Mac")).toBe("Safari extension · Mac");
    expect(deviceTokenLabel("Chrome", null)).toBe("Chrome extension");
  });

  it("never echoes an unknown client string", () => {
    expect(deviceTokenLabel("<b>evil</b>", "Windows PC")).toBe("Browser extension · Windows PC");
    expect(deviceTokenLabel(undefined, null)).toBe("Browser extension");
  });
});

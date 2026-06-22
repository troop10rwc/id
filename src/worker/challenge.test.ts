import { describe, expect, it } from "vitest";
import { signValue, verifyValue } from "./challenge.js";
import { b64urlEncode, utf8 } from "./encoding.js";

const SECRET = "test-secret-please-rotate";

describe("signed challenge cookies", () => {
  it("round-trips a value", async () => {
    const tok = await signValue("hello world", 300, SECRET);
    expect(await verifyValue(tok, SECRET)).toBe("hello world");
  });

  it("round-trips JSON (the OIDC state/PKCE stash)", async () => {
    const stash = JSON.stringify({ state: "abc", verifier: "xyz", redirect: "/profile" });
    const tok = await signValue(stash, 300, SECRET);
    expect(JSON.parse((await verifyValue(tok, SECRET))!)).toEqual({
      state: "abc",
      verifier: "xyz",
      redirect: "/profile",
    });
  });

  it("rejects a wrong secret (tamper / forged)", async () => {
    const tok = await signValue("v", 300, SECRET);
    expect(await verifyValue(tok, "other-secret")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const tok = await signValue("v", 300, SECRET);
    const [, exp, sig] = tok.split(".");
    const forged = `${b64urlEncode(utf8("evil"))}.${exp}.${sig}`;
    expect(await verifyValue(forged, SECRET)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const tok = await signValue("v", -1, SECRET);
    expect(await verifyValue(tok, SECRET)).toBeNull();
  });

  it("rejects missing / malformed tokens", async () => {
    expect(await verifyValue(undefined, SECRET)).toBeNull();
    expect(await verifyValue("", SECRET)).toBeNull();
    expect(await verifyValue("a.b", SECRET)).toBeNull();
    expect(await verifyValue("a.b.c.d", SECRET)).toBeNull();
  });
});

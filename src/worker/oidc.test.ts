import { describe, expect, it } from "vitest";
import { buildAuthorizeUrl, extractClaims, isTroopMember, SLACK_TEAM_CLAIM } from "./oidc.js";

const TEAM = "TN69FH34Y";

describe("buildAuthorizeUrl", () => {
  it("includes the fixed scope and the confidential-flow params", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "https://troop10rwc.org/slack/callback",
        state: "st",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://slack.com/openid/connect/authorize");
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("state")).toBe("st");
    // No PKCE: confidential flow, secret authenticates the token exchange.
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });
});

describe("extractClaims + isTroopMember (membership gate)", () => {
  const base = { sub: "U123", name: "Alice", email: "a@x", [SLACK_TEAM_CLAIM]: TEAM };

  it("extracts the claims we use, including team_id", () => {
    expect(extractClaims(base)).toEqual({
      sub: "U123",
      name: "Alice",
      email: "a@x",
      teamId: TEAM,
    });
  });

  it("admits a member of the troop workspace", () => {
    expect(isTroopMember(extractClaims(base), TEAM)).toBe(true);
  });

  it("rejects a valid Slack user from another workspace", () => {
    const other = extractClaims({ ...base, [SLACK_TEAM_CLAIM]: "TZZZOTHER" });
    expect(isTroopMember(other, TEAM)).toBe(false);
  });

  it("rejects when the team_id claim is absent", () => {
    const { [SLACK_TEAM_CLAIM]: _drop, ...noTeam } = base;
    expect(isTroopMember(extractClaims(noTeam), TEAM)).toBe(false);
  });

  it("rejects when sub is missing", () => {
    const noSub = extractClaims({ [SLACK_TEAM_CLAIM]: TEAM });
    expect(isTroopMember(noSub, TEAM)).toBe(false);
  });
});

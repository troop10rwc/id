/**
 * Pure Slack-OIDC helpers — no network, no worker-kit imports — so the
 * security-critical bits (the team_id membership gate, the authorize-URL shape)
 * are unit-testable in isolation. The network handlers live in slack.ts.
 */

export const SLACK_AUTHORIZE = "https://slack.com/openid/connect/authorize";
export const SLACK_TOKEN = "https://slack.com/api/openid.connect.token";
export const SLACK_JWKS = "https://slack.com/openid/connect/keys";
export const SLACK_ISSUER = "https://slack.com";
export const SLACK_TEAM_CLAIM = "https://slack.com/team_id";

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
}

/** Build the Slack authorize URL. Missing `openid`/`profile` scope is a common
 *  silent failure, so the scope set is fixed here. This is the confidential
 *  authorization-code flow (the code is exchanged with the client_secret in
 *  slack.ts) — no PKCE: Slack's openid.connect.token rejects code_verifier with
 *  `internal_error` for this app, and a server-side Worker keeps the secret. */
export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const url = new URL(SLACK_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("state", p.state);
  return url.toString();
}

/** Claims we care about from a verified Slack id_token. */
export interface SlackClaims {
  sub: string;
  name?: string;
  email?: string;
  teamId?: string;
}

/** Extract the claims we use from an (already signature-verified) payload. */
export function extractClaims(payload: Record<string, unknown>): SlackClaims {
  return {
    sub: String(payload.sub ?? ""),
    name: typeof payload.name === "string" ? payload.name : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    teamId: typeof payload[SLACK_TEAM_CLAIM] === "string"
      ? (payload[SLACK_TEAM_CLAIM] as string)
      : undefined,
  };
}

/**
 * THE membership gate. Without this, any Slack user on earth who completes the
 * OIDC dance would be enrolled. Lock to the troop workspace.
 */
export function isTroopMember(claims: SlackClaims, troopTeamId: string): boolean {
  return !!claims.sub && claims.teamId === troopTeamId;
}

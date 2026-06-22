import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { StoredCredential } from "./db.js";
import type { Env } from "./env.js";
import { utf8 } from "./encoding.js";

/**
 * WebAuthn ceremonies. The invariants from the brief live here:
 *  - rpID is the registrable PARENT (env.RP_ID = troop10rwc.org) so one passkey
 *    works on every subdomain.
 *  - expectedOrigin is pinned to this hub's origin (env.AUTH_ORIGIN).
 *  - userVerification "preferred" keeps older authenticators usable.
 *  - residentKey "preferred" yields discoverable creds → usernameless login.
 */

export async function buildRegistrationOptions(
  env: Env,
  sub: string,
  userName: string,
  existingCredentialIds: string[],
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: env.RP_NAME,
    rpID: env.RP_ID,
    userName,
    userID: utf8(sub),
    attestationType: "none",
    excludeCredentials: existingCredentialIds.map((id) => ({ id })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
}

/** Verify a registration response against the stashed challenge. Returns the
 *  credential to store, or null if verification failed. */
export async function verifyRegistration(
  env: Env,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<StoredCredential | null> {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.AUTH_ORIGIN,
    expectedRPID: env.RP_ID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return null;
  const { credential } = verification.registrationInfo;
  return {
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
  };
}

export async function buildAuthenticationOptions(
  env: Env,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  // Empty allowCredentials — credentials are discoverable, so the browser offers
  // any matching passkey for conditional-UI (autofill) login.
  return generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: "preferred",
    allowCredentials: [],
  });
}

/** Verify an authentication assertion; returns the new signature counter on
 *  success (always read+persist it — clone detection). */
export async function verifyAuthentication(
  env: Env,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  stored: StoredCredential,
): Promise<{ verified: boolean; newCounter: number }> {
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: env.AUTH_ORIGIN,
    expectedRPID: env.RP_ID,
    requireUserVerification: false,
    credential: {
      id: stored.id,
      publicKey: stored.publicKey,
      counter: stored.counter,
      transports: stored.transports,
    },
  });
  return {
    verified: verification.verified,
    newCounter: verification.authenticationInfo?.newCounter ?? stored.counter,
  };
}

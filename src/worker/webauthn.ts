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
import { utf8 } from "./encoding.js";

/**
 * WebAuthn ceremonies. The invariants from the brief live here:
 *  - rpID is the registrable PARENT so one passkey works on every subdomain.
 *  - expectedOrigin is pinned to a known origin (never trusted from the request
 *    on prod).
 *  - userVerification "preferred" keeps older authenticators usable.
 *  - residentKey "preferred" yields discoverable creds → usernameless login.
 *
 * The rpID/origin aren't read straight from env: prod uses the pinned env values
 * (troop10rwc.org / AUTH_ORIGIN), but the Access-restricted *.workers.dev preview
 * URLs derive them per-request (the kit can't issue a troop10rwc.org passkey on a
 * workers.dev origin). The caller resolves the right pair and passes it as `rp`.
 */
export interface RpContext {
  /** WebAuthn rpID — the registrable domain (prod: troop10rwc.org; preview: the
   *  workers.dev apex, e.g. tactical.workers.dev). */
  id: string;
  /** Human label shown in the passkey prompt. */
  name: string;
  /** Expected ceremony origin (prod: AUTH_ORIGIN; preview: the request origin). */
  origin: string;
}

export async function buildRegistrationOptions(
  rp: RpContext,
  sub: string,
  userName: string,
  existingCredentialIds: string[],
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName,
    userID: utf8(sub).slice(), // .slice() => the library's Uint8Array_ generic
    attestationType: "none",
    excludeCredentials: existingCredentialIds.map((id) => ({ id })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
}

/** Verify a registration response against the stashed challenge. Returns the
 *  credential to store, or null if verification failed. */
export async function verifyRegistration(
  rp: RpContext,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
): Promise<StoredCredential | null> {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return null;
  // registrationInfo.credential is already a WebAuthnCredential (= StoredCredential).
  return verification.registrationInfo.credential;
}

export async function buildAuthenticationOptions(
  rp: RpContext,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  // Empty allowCredentials — credentials are discoverable, so the browser offers
  // any matching passkey for conditional-UI (autofill) login.
  return generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "preferred",
    allowCredentials: [],
  });
}

/** Verify an authentication assertion; returns the new signature counter on
 *  success (always read+persist it — clone detection). */
export async function verifyAuthentication(
  rp: RpContext,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  stored: StoredCredential,
): Promise<{ verified: boolean; newCounter: number }> {
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    requireUserVerification: false,
    credential: stored,
  });
  return {
    verified: verification.verified,
    newCounter: verification.authenticationInfo?.newCounter ?? stored.counter,
  };
}

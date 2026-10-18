"use client";
// Hardware signing over a case's Merkle root: real WebAuthn (TouchID, Windows Hello, a USB key
// or Chrome's virtual authenticator) or the simulated "VaultKey FIPS" (a non-extractable
// WebCrypto ECDSA P-256 key in this tab). The server verifies both with ES256.
import { post } from "@/lib/api";

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
export const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
const hexBytes = (h: string) => new Uint8Array(h.match(/.{2}/g)!.map((x) => parseInt(x, 16)));

export type Signed = { method: "webauthn" | "vaultkey"; assertion: any; raw?: { authenticatorData: string; clientDataJSON: string; signature: string } };

let vault: { keys: CryptoKeyPair; spki: string; counter: number } | null = null;

export async function signWebAuthn(root: string): Promise<Signed> {
  const challenge = hexBytes(root);
  const cred: any = await navigator.credentials.create({ publicKey: {
    challenge, rp: { name: "BankWeave" }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "analyst", displayName: "BankWeave analyst" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { userVerification: "preferred" }, attestation: "none", timeout: 60000 } });
  const pk = cred.response.getPublicKey?.();
  if (!pk) throw new Error("This browser cannot export the key's public key; use VaultKey.");
  const a: any = await navigator.credentials.get({ publicKey: { challenge, allowCredentials: [{ type: "public-key", id: cred.rawId }], userVerification: "preferred", timeout: 60000 } });
  return {
    method: "webauthn",
    assertion: {
      public_key: b64(pk), signature: b64(a.response.signature), authenticator_data: b64(a.response.authenticatorData),
      client_data_json: b64(a.response.clientDataJSON), credential_id: b64(cred.rawId),
      registration_authenticator_data: cred.response.getAuthenticatorData ? b64(cred.response.getAuthenticatorData()) : undefined,
      device: "WebAuthn authenticator",
    },
    raw: { authenticatorData: hex(a.response.authenticatorData), clientDataJSON: new TextDecoder().decode(a.response.clientDataJSON), signature: hex(a.response.signature) },
  };
}

export async function signVaultKey(root: string): Promise<Signed> {
  if (!vault) {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
    vault = { keys, spki: b64(await crypto.subtle.exportKey("spki", keys.publicKey)), counter: 0 };
  }
  vault.counter += 1;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vault.keys.privateKey, new TextEncoder().encode(root));
  return { method: "vaultkey", assertion: { public_key: vault.spki, signature: b64(sig), counter: vault.counter, origin: location.origin, device: "VaultKey FIPS (virtual)" },
    raw: { authenticatorData: "(VaultKey signs the root directly)", clientDataJSON: JSON.stringify({ message: root }), signature: hex(sig) } };
}

export async function submitSignature(caseId: string, target: string, root: string, s: Signed) {
  return post("/hardware/attest", { case_id: caseId, target, method: s.method, merkle_root: root, assertion: s.assertion });
}

export async function keyFingerprint(spkiB64: string) {
  const d = await crypto.subtle.digest("SHA-256", Uint8Array.from(atob(spkiB64), (c) => c.charCodeAt(0)));
  return hex(d).slice(0, 16);
}

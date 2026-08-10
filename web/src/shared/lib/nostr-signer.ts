import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { nip19 } from "nostr-tools";

export type UnsignedNostrEvent = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export type SignedNostrEvent = UnsignedNostrEvent & {
  id: string;
  pubkey: string;
  sig: string;
};

type Nip07Provider = {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
};

declare global {
  interface Window {
    nostr?: Nip07Provider;
  }
}

export class Nip07UnavailableError extends Error {
  constructor() {
    super("A durable LenOS signer is required for this action.");
    this.name = "Nip07UnavailableError";
  }
}

export const IDENTITY_STATE_CHANGE_EVENT = "lenos-identity-state-change";
const MANAGED_SIGNER_TOKEN_KEY = "lenos_managed_signer_token";
const MANAGED_SIGNER_PUBKEY_KEY = "lenos_managed_signer_pubkey";
const MANAGED_SIGNER_API = "https://growth-api.lenquant.com";
const LOCAL_NSEC_KEY = "lenos_nsec";

export function hasLocalNsec(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOCAL_NSEC_KEY) !== null;
}

export function getLocalNsec(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(LOCAL_NSEC_KEY);
}

export function setLocalNsec(nsec: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_NSEC_KEY, nsec);
  window.dispatchEvent(new Event(IDENTITY_STATE_CHANGE_EVENT));
}

export function clearLocalNsec(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_NSEC_KEY);
  window.dispatchEvent(new Event(IDENTITY_STATE_CHANGE_EVENT));
}

let ephemeralSecretKey: Uint8Array | null = null;

function getEphemeralSecretKey(): Uint8Array {
  if (!ephemeralSecretKey) {
    ephemeralSecretKey = generateSecretKey();
  }
  return ephemeralSecretKey;
}

export function hasNip07Provider(): boolean {
  return typeof window !== "undefined" && window.nostr != null;
}

function getManagedSignerSession(): { token: string; pubkey: string } | null {
  if (typeof window === "undefined") return null;
  const token = window.sessionStorage.getItem(MANAGED_SIGNER_TOKEN_KEY);
  const pubkey = window.sessionStorage.getItem(MANAGED_SIGNER_PUBKEY_KEY);
  return token && pubkey ? { token, pubkey } : null;
}

export function setManagedSignerSession(token: string, pubkey: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(MANAGED_SIGNER_TOKEN_KEY, token);
  window.sessionStorage.setItem(MANAGED_SIGNER_PUBKEY_KEY, pubkey);
  window.dispatchEvent(new Event(IDENTITY_STATE_CHANGE_EVENT));
}

export function clearManagedSignerSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(MANAGED_SIGNER_TOKEN_KEY);
  window.sessionStorage.removeItem(MANAGED_SIGNER_PUBKEY_KEY);
  window.dispatchEvent(new Event(IDENTITY_STATE_CHANGE_EVENT));
}

function getLocalSecretKey(): Uint8Array | null {
  const nsec = getLocalNsec();
  if (!nsec) return null;
  try {
    const decoded = nip19.decode(nsec.trim());
    if (decoded.type !== "nsec") return null;
    return decoded.data;
  } catch {
    return null;
  }
}

export function consumeManagedSignerSessionFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const fragmentParams = new URLSearchParams(url.hash.slice(1));
  const token =
    url.searchParams.get("managed_signer_token") ??
    fragmentParams.get("managed_signer_token");
  const pubkey =
    url.searchParams.get("managed_signer_pubkey") ??
    fragmentParams.get("managed_signer_pubkey");
  if (!token || !pubkey || !/^[0-9a-f]{64}$/.test(pubkey)) return false;
  setManagedSignerSession(token, pubkey);
  url.searchParams.delete("managed_signer_token");
  url.searchParams.delete("managed_signer_pubkey");
  url.hash = "";
  window.history.replaceState({}, document.title, url.toString());
  return true;
}

/** True only for an identity that survives a page reload. */
export function hasDurableIdentity(): boolean {
  return hasNip07Provider() || getManagedSignerSession() !== null || hasLocalNsec();
}

export async function getCurrentPubkey(): Promise<string | null> {
  if (hasNip07Provider()) {
    try {
      // biome-ignore lint/style/noNonNullAssertion: guarded by hasNip07Provider()
      return await window.nostr!.getPublicKey();
    } catch {
      return null;
    }
  }
  const managed = getManagedSignerSession();
  if (managed) return managed.pubkey;
  const secretKey = getLocalSecretKey();
  if (secretKey) return getPublicKey(secretKey);
  return getPublicKey(getEphemeralSecretKey());
}

function sameUnsignedEvent(
  expected: UnsignedNostrEvent,
  actual: SignedNostrEvent,
): boolean {
  return (
    actual.kind === expected.kind &&
    actual.created_at === expected.created_at &&
    actual.content === expected.content &&
    JSON.stringify(actual.tags) === JSON.stringify(expected.tags)
  );
}

/**
 * Sign with NIP-07 when available, otherwise use a page-lifetime key.
 *
 * The ephemeral fallback preserves anonymous browsing on open relays. Flows
 * that create durable membership must set `requireNip07` so a reload cannot
 * orphan a relay-membership row.
 */
export async function signNostrEvent(
  template: Omit<UnsignedNostrEvent, "created_at"> & {
    created_at?: number;
  },
  options?: { requireNip07?: boolean },
): Promise<SignedNostrEvent> {
  const unsigned: UnsignedNostrEvent = {
    ...template,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  };
  const provider = typeof window === "undefined" ? undefined : window.nostr;

  if (provider) {
    const expectedPubkey = await provider.getPublicKey();
    const signed = await provider.signEvent(unsigned);
    if (
      signed.pubkey !== expectedPubkey ||
      !sameUnsignedEvent(unsigned, signed) ||
      typeof signed.id !== "string" ||
      typeof signed.sig !== "string"
    ) {
      throw new Error("The NIP-07 extension returned an invalid signed event.");
    }
    return signed;
  }

  const managed = getManagedSignerSession();
  if (managed) {
    const response = await fetch(
      `${MANAGED_SIGNER_API}/api/auth/managed-nostr/sign`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${managed.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(unsigned),
      },
    );
    if (!response.ok) {
      if (response.status === 401) clearManagedSignerSession();
      const payload = (await response.json().catch(() => null)) as {
        detail?: string;
      } | null;
      throw new Error(
        payload?.detail ?? "Managed LenOS signer rejected the event.",
      );
    }
    const payload = (await response.json()) as { event?: SignedNostrEvent };
    const signed = payload.event;
    if (
      !signed ||
      signed.pubkey !== managed.pubkey ||
      !sameUnsignedEvent(unsigned, signed) ||
      typeof signed.id !== "string" ||
      typeof signed.sig !== "string"
    ) {
      throw new Error("Managed LenOS signer returned an invalid signed event.");
    }
    return signed;
  }

  const localSecret = getLocalSecretKey();
  if (localSecret) {
    const signed = finalizeEvent(unsigned, localSecret);
    if (signed.pubkey !== getPublicKey(localSecret)) {
      throw new Error("Failed to sign with local identity.");
    }
    return signed;
  }

  if (options?.requireNip07) {
    throw new Nip07UnavailableError();
  }

  const secretKey = getEphemeralSecretKey();
  const signed = finalizeEvent(unsigned, secretKey);
  if (signed.pubkey !== getPublicKey(secretKey)) {
    throw new Error("Failed to create the ephemeral browser identity.");
  }
  return signed;
}

import { nip19 } from "nostr-tools";
import { getConversationKey, encrypt, decrypt } from "nostr-tools/nip44";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { getLocalNsec } from "@/shared/lib/nostr-signer";

export function getEncryptionKey(): Uint8Array | null {
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

async function fetchRelayPubkey(): Promise<string> {
  const res = await fetch(`${relayHttpBaseUrl()}/api/relay/pubkey`);
  if (!res.ok) throw new Error(`fetchRelayPubkey failed: ${res.status}`);
  const data = (await res.json()) as { pubkey: string };
  return data.pubkey;
}

export async function saveCredentials(
  agentDTag: string,
  envVars: Record<string, string>,
): Promise<void> {
  const userSeckey = getEncryptionKey();
  if (!userSeckey) {
    throw new Error(
      "Credential encryption requires a local Nostr key. Set one up in Settings.",
    );
  }
  const relayPubkey = await fetchRelayPubkey();
  const ck = getConversationKey(userSeckey, relayPubkey);
  const plaintext = JSON.stringify(envVars);
  const ciphertext = encrypt(plaintext, ck);
  const url = `${relayHttpBaseUrl()}/api/agent-credentials`;
  const body = JSON.stringify({ agent_d_tag: agentDTag, ciphertext });
  const authorization = await makeNip98AuthHeader(url, "PUT", { body });
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `save credentials failed: ${res.status}`);
  }
}

export async function loadCredentialKeys(
  agentDTag: string,
): Promise<Record<string, string> | null> {
  const userSeckey = getEncryptionKey();
  if (!userSeckey) return null;
  const relayPubkey = await fetchRelayPubkey();
  const url = `${relayHttpBaseUrl()}/api/agent-credentials/${agentDTag}`;
  const authorization = await makeNip98AuthHeader(url, "GET");
  const res = await fetch(url, { headers: { Authorization: authorization } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`load credentials failed: ${res.status}`);
  const data = (await res.json()) as { ciphertext: string };
  const ck = getConversationKey(userSeckey, relayPubkey);
  const plaintext = decrypt(data.ciphertext, ck);
  return JSON.parse(plaintext) as Record<string, string>;
}

export async function deleteCredentials(agentDTag: string): Promise<void> {
  const url = `${relayHttpBaseUrl()}/api/agent-credentials/${agentDTag}`;
  const authorization = await makeNip98AuthHeader(url, "DELETE");
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: authorization },
  });
  if (!res.ok) throw new Error(`delete credentials failed: ${res.status}`);
}

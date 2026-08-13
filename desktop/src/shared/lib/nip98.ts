import { signRelayEvent } from "@/shared/api/tauri";

/**
 * Build a NIP-98 Authorization header value by signing a kind:27235 event
 * using the desktop's locally held Nostr key via the Tauri backend.
 */
export async function makeNip98AuthHeader(
  url: string,
  method: string,
): Promise<string> {
  const event = await signRelayEvent({
    kind: 27235,
    content: "",
    tags: [
      ["u", url],
      ["method", method],
    ],
  });
  return `Nostr ${btoa(JSON.stringify(event))}`;
}

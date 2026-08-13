/**
 * Upload an image file to the relay's Blossom endpoint and return its URL.
 *
 * Uses PUT /media/upload with a NIP-98 Authorization header. The relay base URL
 * is derived from relayWsUrl() by converting the WS scheme to HTTP.
 */

import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";

const MAX_EMOJI_BYTES = 1_024 * 1_024; // 1 MB

/** Return an error string if the file is not a valid emoji image, or null if OK. */
export function validateEmojiFile(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Only image files are allowed.";
  }
  if (file.size > MAX_EMOJI_BYTES) {
    return "Image must be 1 MB or smaller.";
  }
  return null;
}

/**
 * Upload a File to the relay Blossom endpoint. Returns the public blob URL.
 *
 * Callers should validate the file with `validateEmojiFile` before calling
 * this function.
 */
export async function uploadEmojiFile(file: File): Promise<string> {
  const uploadUrl = `${relayHttpBaseUrl()}/media/upload`;

  const authHeader = await makeNip98AuthHeader(uploadUrl, "PUT");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      text.trim() || `Upload failed with status ${response.status.toString()}.`,
    );
  }

  const json = (await response.json()) as { url?: string };
  if (!json.url) {
    throw new Error("Relay did not return a URL for the uploaded file.");
  }
  return json.url;
}

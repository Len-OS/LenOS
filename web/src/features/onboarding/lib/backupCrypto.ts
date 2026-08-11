import { nip19 } from "nostr-tools";
import { getPublicKey } from "nostr-tools/pure";
import { encrypt, decrypt } from "nostr-tools/nip49";

const NSEC_KEY = "lenos_nsec";

export const MIN_PASSPHRASE_LEN = 8;

export function getStoredNsec(): string | null {
  return localStorage.getItem(NSEC_KEY);
}

function nsecToSecretBytes(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec.trim());
  if (decoded.type !== "nsec") throw new Error("Not a valid nsec.");
  return decoded.data;
}

export function createNcryptsecBackup(password: string): string {
  const nsec = getStoredNsec();
  if (!nsec) throw new Error("No private key stored.");
  const secretBytes = nsecToSecretBytes(nsec);
  return encrypt(secretBytes, password, 16);
}

export type BackupVerification = {
  pubkey: string;
  npub: string;
  matchesCurrentIdentity: boolean;
};

export function verifyNcryptsecBackup(
  ncryptsec: string,
  password: string,
): BackupVerification {
  const secretBytes = decrypt(ncryptsec.trim(), password);
  const pubkeyHex = getPublicKey(secretBytes);
  const npub = nip19.npubEncode(pubkeyHex);
  const storedNsec = getStoredNsec();
  let matchesCurrentIdentity = false;
  if (storedNsec) {
    try {
      const currentPub = getPublicKey(nsecToSecretBytes(storedNsec));
      matchesCurrentIdentity = currentPub === pubkeyHex;
    } catch {
      // ignore
    }
  }
  return { pubkey: pubkeyHex, npub, matchesCurrentIdentity };
}

export function downloadBackupFile(ncryptsec: string): void {
  const blob = new Blob([ncryptsec], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lenos-backup-${Date.now()}.ncryptsec`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function generatePassphrase(wordCount = 4): string {
  const words = [
    "amber",
    "breeze",
    "coral",
    "dawn",
    "ember",
    "frost",
    "grove",
    "haze",
    "ivory",
    "jade",
    "knoll",
    "lark",
    "mist",
    "noble",
    "opal",
    "pine",
    "quill",
    "ridge",
    "sage",
    "thorn",
    "unity",
    "vale",
    "wren",
    "yarn",
    "zest",
    "bloom",
    "crane",
    "drift",
    "echo",
    "fern",
    "gleam",
    "helm",
    "isle",
    "jewel",
    "kite",
    "leaf",
    "moss",
    "nest",
    "orbit",
    "pearl",
    "realm",
    "stone",
    "trail",
    "umber",
    "vivid",
    "wisp",
    "xenon",
    "yield",
  ];
  const indices = new Uint32Array(wordCount);
  crypto.getRandomValues(indices);
  return Array.from(indices, (n) => words[n % words.length]).join("-");
}

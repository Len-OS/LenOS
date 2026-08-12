import { nip19 } from "nostr-tools";
import { getPublicKey } from "nostr-tools/pure";

export type KeyImportKind = "nsec" | "ncryptsec" | "unknown";

const NCRYPTSEC_HRP = "ncryptsec";
const NIP49_PAYLOAD_BYTES = 91;
export const NCRYPTSEC_ENCODED_LENGTH = 162;
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32_GENERATORS = [
  0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3,
] as const;

function bech32Polymod(values: readonly number[]): number {
  let checksum = 1;
  for (const value of values) {
    const high = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < BECH32_GENERATORS.length; index += 1) {
      if ((high >>> index) & 1) checksum ^= BECH32_GENERATORS[index];
    }
  }
  return checksum >>> 0;
}

function expandBech32Hrp(hrp: string): number[] {
  return [
    ...Array.from(hrp, (c) => c.charCodeAt(0) >>> 5),
    0,
    ...Array.from(hrp, (c) => c.charCodeAt(0) & 31),
  ];
}

function convertFiveBitWordsToBytes(words: readonly number[]): number[] | null {
  let accumulator = 0;
  let bitCount = 0;
  const bytes: number[] = [];
  for (const word of words) {
    accumulator = (accumulator << 5) | word;
    bitCount += 5;
    while (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((accumulator >>> bitCount) & 0xff);
    }
  }
  if (bitCount >= 5 || ((accumulator << (8 - bitCount)) & 0xff) !== 0) {
    return null;
  }
  return bytes;
}

export function classifyKeyImportInput(input: string): KeyImportKind {
  const trimmed = input.trim();
  if (trimmed.slice(0, 10).toLowerCase() === "ncryptsec1") return "ncryptsec";
  if (trimmed.startsWith("nsec1")) return "nsec";
  return "unknown";
}

export function isPlausibleNcryptsec(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length !== NCRYPTSEC_ENCODED_LENGTH) return false;
  if (trimmed !== trimmed.toLowerCase() && trimmed !== trimmed.toUpperCase()) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  const separatorIndex = normalized.lastIndexOf("1");
  if (
    separatorIndex !== NCRYPTSEC_HRP.length ||
    normalized.slice(0, separatorIndex) !== NCRYPTSEC_HRP
  ) {
    return false;
  }
  const encoded = normalized.slice(separatorIndex + 1);
  const words = Array.from(encoded, (c) => BECH32_CHARSET.indexOf(c));
  if (words.some((w) => w < 0) || words.length <= 6) return false;
  if (bech32Polymod([...expandBech32Hrp(NCRYPTSEC_HRP), ...words]) !== 1) {
    return false;
  }
  const payload = convertFiveBitWordsToBytes(words.slice(0, -6));
  return payload?.length === NIP49_PAYLOAD_BYTES && payload[0] === 2;
}

export function nsecToNpub(nsec: string): string | null {
  const trimmed = nsec.trim();
  if (!trimmed.startsWith("nsec1")) return null;
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "nsec") return null;
    const pubkeyHex = getPublicKey(decoded.data);
    return nip19.npubEncode(pubkeyHex);
  } catch {
    return null;
  }
}

export function keyImportSubmitEnabled(
  input: string,
  passphrase: string,
): boolean {
  const kind = classifyKeyImportInput(input);
  if (kind === "ncryptsec") {
    return isPlausibleNcryptsec(input) && passphrase.length > 0;
  }
  return nsecToNpub(input) !== null;
}

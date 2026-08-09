import { isTauri } from "@tauri-apps/api/core";
import { copyTextToSystemClipboard } from "@/shared/api/tauriMedia";

const LENOS_CODE_BLOCK_ATTRIBUTE = "data-lenos-code-block";

// In-memory cache so the paste handler can detect a code-block copy even when
// the browser clipboard path writes only text/plain (avoids the Windows/Chromium
// issue where CF_UNICODETEXT is synthesized from CF_HTML, producing padded text).
let lastCopiedCodeBlock: { code: string; seq: number } | null = null;
let lastCopiedSeq = 0;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createLenOSCodeBlockHtml(code: string) {
  return `<div ${LENOS_CODE_BLOCK_ATTRIBUTE}="true"><code>${escapeHtml(code)}</code></div>`;
}

export async function copyCodeBlockToClipboard(code: string) {
  const seq = ++lastCopiedSeq;

  // In Tauri, arboard.set_html writes both CF_HTML and CF_UNICODETEXT correctly
  // so readText() returns the exact plain-text string on all platforms.
  if (isTauri()) {
    await copyTextToSystemClipboard(code, createLenOSCodeBlockHtml(code));
    lastCopiedCodeBlock = { code, seq };
    return;
  }

  // Browser path (Playwright / web preview): writing ClipboardItem with text/html
  // causes Windows to synthesize CF_UNICODETEXT from CF_HTML, making readText()
  // return column-padded text. Write plain text only and store the code-block
  // marker in memory so the paste handler can detect it via lastCopiedCodeBlock.
  const clipboard = navigator.clipboard;
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(code);
      lastCopiedCodeBlock = { code, seq };
      return;
    } catch (error) {
      console.warn("Failed to write code block to clipboard", error);
    }
  }

  await copyTextToSystemClipboard(code, createLenOSCodeBlockHtml(code));
  lastCopiedCodeBlock = { code, seq };
}

export function getLenOSCodeBlockClipboardText(
  clipboardData: DataTransfer | null | undefined,
) {
  // Primary path: Tauri native clipboard wrote text/html with our marker.
  const html = clipboardData?.getData("text/html");
  if (html?.includes(LENOS_CODE_BLOCK_ATTRIBUTE)) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const codeEl = doc.querySelector(`[${LENOS_CODE_BLOCK_ATTRIBUTE}] code`);
    const fallback = doc.querySelector(`[${LENOS_CODE_BLOCK_ATTRIBUTE}]`);
    return codeEl?.textContent ?? fallback?.textContent ?? null;
  }

  // Fallback path: browser clipboard wrote only text/plain (no CF_HTML marker).
  // Match against the in-memory cache set by copyCodeBlockToClipboard.
  // Normalize CRLF to LF before comparing — Windows clipboard normalizes \n to
  // \r\n in CF_UNICODETEXT, so the pasted text/plain differs from the cached LF.
  if (lastCopiedCodeBlock !== null) {
    const plainText = clipboardData?.getData("text/plain");
    if (
      plainText !== undefined &&
      plainText.replace(/\r\n/g, "\n") === lastCopiedCodeBlock.code
    ) {
      return lastCopiedCodeBlock.code;
    }
  }

  return null;
}

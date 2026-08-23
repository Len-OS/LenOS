// web/src/shared/lib/platform.ts

/**
 * Returns true when running inside the Tauri desktop shell.
 * window.__TAURI_INTERNALS__ is injected by Tauri 2 on all webview pages.
 */
export function isDesktopApp(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ != null
  );
}

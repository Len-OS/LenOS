const PENDING_INVITE_KEY = "lenos_pending_invite";

export type PendingInvite = { relayWsUrl: string; code: string };

export function consumePendingInviteFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const relayWsUrl = url.searchParams.get("invite_relay");
  const code = url.searchParams.get("invite_code");
  if (!relayWsUrl || !code) return;
  const invite: PendingInvite = { relayWsUrl, code };
  window.sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(invite));
  url.searchParams.delete("invite_relay");
  url.searchParams.delete("invite_code");
  window.history.replaceState({}, document.title, url.toString());
}

export function getPendingInvite(): PendingInvite | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_INVITE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingInvite;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PENDING_INVITE_KEY);
}

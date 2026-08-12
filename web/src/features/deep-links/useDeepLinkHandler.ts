import { useEffect } from "react";
import type { useNavigate } from "@tanstack/react-router";
import { parseLenOSUri, type DeepLinkAction } from "./deepLinkParser";

const PROTOCOL_PARAM = "_lenos";

type NavigateFn = ReturnType<typeof useNavigate>;

interface Options {
  navigate: NavigateFn;
  openProfile: (pubkey: string) => void;
}

export function registerWebPlusLenOSProtocol(): void {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.registerProtocolHandler !== "function"
  )
    return;
  try {
    navigator.registerProtocolHandler(
      "web+lenos",
      `${window.location.origin}/?${PROTOCOL_PARAM}=%s`,
    );
  } catch {
    // Not all browsers permit this — silently ignore
  }
}

export function useDeepLinkHandler({ navigate, openProfile }: Options): void {
  useEffect(() => {
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get(PROTOCOL_PARAM);
    if (!encoded) return;

    url.searchParams.delete(PROTOCOL_PARAM);
    window.history.replaceState({}, "", url.toString());

    const action = parseLenOSUri(decodeURIComponent(encoded));
    if (action) applyDeepLinkAction(action, navigate, openProfile);
  }, [navigate, openProfile]);
}

export function applyDeepLinkAction(
  action: DeepLinkAction,
  navigate: NavigateFn,
  openProfile: (pubkey: string) => void,
): void {
  switch (action.type) {
    case "channel":
      void navigate({
        to: "/channels/$channelId",
        params: { channelId: action.channelId },
      });
      break;
    case "dm":
      void navigate({
        to: "/messages/$channelId",
        params: { channelId: action.channelId },
      });
      break;
    case "user":
      openProfile(action.pubkey);
      break;
    case "invite":
      void navigate({
        to: "/invite/$code",
        params: { code: action.code },
      });
      break;
    case "navigate":
      // action.to is one of the known route paths validated by parseLenOSPath
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void navigate({ to: action.to as any });
      break;
  }
}

export type DeepLinkAction =
  | { type: "channel"; channelId: string }
  | { type: "dm"; channelId: string }
  | { type: "user"; pubkey: string }
  | { type: "invite"; code: string }
  | { type: "navigate"; to: string };

/**
 * Parse a lenos:// or web+lenos:// URI into a navigation action.
 * Also accepts a bare path like "channel/abc" for URL-based deep links.
 */
export function parseLenOSUri(uri: string): DeepLinkAction | null {
  const stripped = uri
    .replace(/^web\+lenos:\/\//, "")
    .replace(/^lenos:\/\//, "");
  return parseLenOSPath(stripped);
}

export function parseLenOSPath(path: string): DeepLinkAction | null {
  const normalized = path.replace(/^\//, "");
  const slash = normalized.indexOf("/");
  const type = slash === -1 ? normalized : normalized.slice(0, slash);
  const id = slash === -1 ? "" : normalized.slice(slash + 1);

  switch (type) {
    case "channel":
      return id ? { type: "channel", channelId: id } : null;
    case "dm":
      return id ? { type: "dm", channelId: id } : null;
    case "user":
      return id ? { type: "user", pubkey: id } : null;
    case "invite":
      return id ? { type: "invite", code: id } : null;
    case "home":
    case "workflows":
    case "agents":
    case "reminders":
    case "pulse":
      return { type: "navigate", to: `/${type}` };
    default:
      return null;
  }
}

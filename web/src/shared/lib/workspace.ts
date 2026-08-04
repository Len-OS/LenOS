import { relayHttpBaseUrl } from "./relay-url";

const PRODUCTION_DOMAIN = "lengrowth.com";
const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "relay",
  "api",
  "growth-api",
  "lenos",
  "mail",
  "smtp",
]);

export interface WorkspaceInfo {
  slug: string;
  communityId: string;
}

export class WorkspaceNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(`Workspace "${slug}" not found`);
    this.name = "WorkspaceNotFoundError";
  }
}

/**
 * Extract tenant slug from hostname.
 * Returns null on localhost, IP, root domain, workers.dev, or reserved subdomains.
 */
export function extractSlug(): string | null {
  const hostname = window.location.hostname;

  if (hostname === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return null;
  }

  if (hostname.endsWith(".workers.dev")) return null;

  const parts = hostname.split(".");
  if (parts.length < 3) return null;

  const baseDomain = parts.slice(1).join(".");
  if (baseDomain !== PRODUCTION_DOMAIN) return null;

  const slug = parts[0];
  if (RESERVED_SLUGS.has(slug)) return null;

  return slug;
}


export async function fetchWorkspace(slug: string): Promise<WorkspaceInfo> {
  // The relay maps the subdomain host to a community automatically on WebSocket
  // connect. Verify existence via NIP-11 relay info (public, no auth needed).
  const base = relayHttpBaseUrl().replace(/\/+$/, "");
  const url = `${base}/`;

  const response = await fetch(url, {
    headers: { Accept: "application/nostr+json" },
    signal: AbortSignal.timeout(8_000),
  });

  // NIP-11 returns 200 with relay metadata when the host is valid.
  // A 404 means no community is configured for this subdomain.
  if (response.status === 404) throw new WorkspaceNotFoundError(slug);
  if (!response.ok) throw new WorkspaceNotFoundError(slug);

  return { slug, communityId: "" };
}

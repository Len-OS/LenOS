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

function extractCommunityId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data)) return extractCommunityId(data[0]);

  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.communities))
    return extractCommunityId(obj.communities[0]);

  const id = obj.id ?? obj.community_id;
  if (typeof id === "string" && id.length > 0) return id;

  return null;
}

export async function fetchWorkspace(slug: string): Promise<WorkspaceInfo> {
  const base = relayHttpBaseUrl().replace(/\/+$/, "");
  const url = `${base}/operator/communities?slug=${encodeURIComponent(slug)}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) throw new WorkspaceNotFoundError(slug);
  if (!response.ok)
    throw new Error(`Failed to load workspace: HTTP ${response.status}`);

  const data: unknown = await response.json().catch(() => null);
  const communityId = extractCommunityId(data);

  if (!communityId) throw new WorkspaceNotFoundError(slug);

  return { slug, communityId };
}

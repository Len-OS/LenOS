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
  relayUrl: string;
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

const LENGROWTH_API = "https://growth-api.lenquant.com";

export async function fetchWorkspace(slug: string): Promise<WorkspaceInfo> {
  const response = await fetch(
    `${LENGROWTH_API}/api/public/workspace/${encodeURIComponent(slug)}`,
    { signal: AbortSignal.timeout(8_000) },
  );

  if (response.status === 404) throw new WorkspaceNotFoundError(slug);
  if (!response.ok) throw new WorkspaceNotFoundError(slug);

  const data = (await response.json()) as {
    slug: string;
    relay_community_id: string;
    relay_url: string;
  };

  return {
    slug: data.slug,
    communityId: data.relay_community_id,
    relayUrl: data.relay_url,
  };
}

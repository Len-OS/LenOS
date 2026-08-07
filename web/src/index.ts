interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  RELAY_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const isWebSocket =
      request.headers.get("Upgrade")?.toLowerCase() === "websocket" ||
      request.headers.get("Connection")?.toLowerCase().includes("upgrade");
    if (isWebSocket) {
      const origin = new URL(env.RELAY_ORIGIN);

      // Keep the workspace hostname as the request Host so the relay can bind
      // the socket to the correct tenant. resolveOverride changes only DNS
      // routing to the stable relay origin; constructing a new URL here would
      // replace Host with relay.lengrowth.com and break NIP-42's tenant-bound
      // relay URL verification.
      return fetch(request, {
        cf: { resolveOverride: origin.hostname },
      } as RequestInit & { cf: { resolveOverride: string } });
    }

    const assetUrl = new URL(request.url);
    // Bypass a stale cached SPA entrypoint after a hashed-asset deployment
    // while preserving the requested application route.
    if (!assetUrl.pathname.startsWith("/assets/")) {
      assetUrl.searchParams.set("_entrypoint", "current");
    }
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    // Never let SPA fallback HTML masquerade as a JavaScript/CSS asset. This
    // gives the client-side stale-chunk recovery a chance to refresh cleanly.
    const pathname = new URL(request.url).pathname;
    if (
      pathname.startsWith("/assets/") &&
      response.headers.get("content-type")?.includes("text/html")
    ) {
      return new Response("Asset not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return response;
  },
};

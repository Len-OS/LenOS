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
      origin.pathname = new URL(request.url).pathname;
      origin.search = new URL(request.url).search;

      // The relay selects the tenant from Host. Keep the workspace hostname
      // while using the stable relay origin for TLS and load-balancer routing.
      const headers = new Headers(request.headers);
      headers.set("Upgrade", "websocket");
      headers.set("Connection", "Upgrade");
      headers.set("Host", new URL(request.url).host);
      return fetch(origin, { method: "GET", headers });
    }

    const assetUrl = new URL(request.url);
    // Resolve application routes through the current entrypoint. This avoids
    // serving a stale cached SPA fallback after a hashed-asset deployment.
    if (!assetUrl.pathname.startsWith("/assets/") && assetUrl.pathname !== "/index.html") {
      assetUrl.pathname = "/index.html";
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

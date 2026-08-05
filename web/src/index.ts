interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  RELAY_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const isWebSocket = request.headers.get("Upgrade")?.toLowerCase() === "websocket"
      || request.headers.get("Connection")?.toLowerCase().includes("upgrade");
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

    return env.ASSETS.fetch(request);
  },
};

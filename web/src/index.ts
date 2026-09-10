interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  RELAY_ORIGIN: string;
}

function buildTraceHeaders(request: Request): Headers {
  const headers = new Headers(request.headers);
  const incomingRequestId = headers.get("X-Request-ID")?.trim() ?? "";
  const requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(incomingRequestId)
    ? incomingRequestId
    : crypto.randomUUID();
  headers.set("X-Request-ID", requestId);

  const correlationId = headers.get("X-Correlation-ID")?.trim() ?? "";
  if (correlationId && !/^[A-Za-z0-9._:-]{1,256}$/.test(correlationId)) {
    headers.delete("X-Correlation-ID");
  }
  return headers;
}

function withTraceHeaders(
  response: Response,
  requestHeaders: Headers,
): Response {
  const headers = new Headers(response.headers);
  const requestId = requestHeaders.get("X-Request-ID");
  if (requestId) headers.set("X-Request-ID", requestId);
  const correlationId = requestHeaders.get("X-Correlation-ID");
  if (correlationId) headers.set("X-Correlation-ID", correlationId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const traceHeaders = buildTraceHeaders(request);
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
      return fetch(new Request(request, { headers: traceHeaders }), {
        cf: { resolveOverride: origin.hostname },
      } as RequestInit & { cf: { resolveOverride: string } });
    }

    const assetUrl = new URL(request.url);
    // Bypass a stale cached SPA entrypoint after a hashed-asset deployment
    // while preserving the requested application route.
    if (!assetUrl.pathname.startsWith("/assets/")) {
      assetUrl.searchParams.set("_entrypoint", "current");
    }
    const response = await env.ASSETS.fetch(
      new Request(assetUrl, {
        method: request.method,
        headers: traceHeaders,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : request.body,
      }),
    );
    // Never let SPA fallback HTML masquerade as a JavaScript/CSS asset. This
    // gives the client-side stale-chunk recovery a chance to refresh cleanly.
    const pathname = new URL(request.url).pathname;
    if (
      pathname.startsWith("/assets/") &&
      response.headers.get("content-type")?.includes("text/html")
    ) {
      return withTraceHeaders(
        new Response("Asset not found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        }),
        traceHeaders,
      );
    }
    return withTraceHeaders(response, traceHeaders);
  },
};

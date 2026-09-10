import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { relayHttpUrl, relayWsUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";
import {
  disconnectGrowthWorkspaceIntegration,
  getGrowthWorkspaceIntegrations,
  growthWorkspaceIntegrationConnectUrl,
  growthCompanyStorageKey,
  type GrowthWorkspaceIntegration,
} from "@/features/growth/api/growth-api";
import { getCurrentPubkey } from "@/shared/lib/nostr-signer";
import { useCommunityId, useWorkspace } from "@/shared/lib/workspace-context";

const PLATFORMS = [
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "linear", label: "Linear" },
  { id: "slack", label: "Slack" },
];

// ── Webhook types ──────────────────────────────────────────────────────────────

interface OutgoingWebhook {
  id: string;
  url: string;
  event_filter: Record<string, unknown>;
  secret: string;
  created_at: string;
}

function syncHealth(integration: GrowthWorkspaceIntegration) {
  const tokenExpiry = integration.token_expiry
    ? Date.parse(integration.token_expiry)
    : NaN;
  if (Number.isFinite(tokenExpiry) && tokenExpiry <= Date.now()) {
    return {
      label: "Token expired",
      className: "text-red-700 dark:text-red-300",
    };
  }
  if (
    integration.last_error ||
    ["failed", "error"].includes(integration.sync_status ?? "")
  ) {
    return {
      label: "Sync needs attention",
      className: "text-red-700 dark:text-red-300",
    };
  }
  if (!integration.last_sync_at) {
    return {
      label: "Awaiting first sync",
      className: "text-amber-700 dark:text-amber-300",
    };
  }
  const lastSync = Date.parse(integration.last_sync_at);
  const stale =
    !Number.isFinite(lastSync) || Date.now() - lastSync > 48 * 60 * 60 * 1000;
  return stale
    ? {
        label: "Sync is stale",
        className: "text-amber-700 dark:text-amber-300",
      }
    : {
        label: "Sync healthy",
        className: "text-emerald-700 dark:text-emerald-300",
      };
}

function webhookBase() {
  return `${relayHttpUrl(relayWsUrl())}/api/webhooks`;
}

// ── Webhooks section ───────────────────────────────────────────────────────────

function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<OutgoingWebhook[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = webhookBase();
      const auth = await makeNip98AuthHeader(url, "GET");
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) return;
      setWebhooks(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAdd = async () => {
    if (!newUrl.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const url = webhookBase();
      const auth = await makeNip98AuthHeader(url, "POST");
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setAddError((body as { error?: string }).error ?? res.statusText);
        return;
      }
      setNewUrl("");
      await refresh();
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    const url = `${webhookBase()}/${id}`;
    const auth = await makeNip98AuthHeader(url, "DELETE");
    await fetch(url, { method: "DELETE", headers: { Authorization: auth } });
    setWebhooks((prev) => prev?.filter((w) => w.id !== id) ?? null);
  };

  if (forbidden) return null;

  return (
    <div className="mt-8">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Outgoing Webhooks
      </p>
      <p className="mb-4 text-xs text-black/50 dark:text-white/50">
        Register HTTP endpoints that receive a POST for each ingested event.
        Admin only.
      </p>

      {loading ? (
        <p className="flex items-center gap-1.5 text-sm text-black/40 dark:text-white/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </p>
      ) : (
        <>
          <div className="mb-3 space-y-2">
            {webhooks?.length === 0 && (
              <p className="text-xs text-black/40 dark:text-white/40">
                No webhooks registered.
              </p>
            )}
            {webhooks?.map((wh) => (
              <div
                key={wh.id}
                className="flex items-center justify-between rounded-lg border border-black/15 px-4 py-3 dark:border-white/15"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-black dark:text-white">
                    {wh.url}
                  </p>
                  <p className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                    Signing secret configured (value hidden)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(wh.id)}
                  className="ml-3 shrink-0 rounded p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
                  aria-label="Remove webhook"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="https://example.com/webhook"
              className="flex-1 rounded-md border border-black/20 bg-transparent px-3 py-1.5 text-sm text-black placeholder-black/30 focus:border-black/40 focus:outline-none dark:border-white/20 dark:text-white dark:placeholder-white/30 dark:focus:border-white/40"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !newUrl.trim()}
              className="flex items-center gap-1 rounded-md bg-black px-3 py-1.5 text-sm text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/80"
            >
              {adding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add
            </button>
          </div>
          {addError && (
            <p className="mt-1.5 text-xs text-red-500">{addError}</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function IntegrationsSettingsPanel() {
  const [integrations, setIntegrations] = useState<
    Record<string, GrowthWorkspaceIntegration>
  >({});
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const workspace = useWorkspace();
  const communityId = useCommunityId();
  const [actorPubkey, setActorPubkey] = useState<string | null>(null);
  const workspaceSlug =
    workspace.status === "found" ? workspace.workspace.slug : "";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) {
      setOauthNotice({
        kind: "success",
        message: `${connected} connected successfully. Refreshing its status…`,
      });
    } else if (error?.endsWith("_oauth_failed")) {
      const platform = error.slice(0, -"_oauth_failed".length);
      setOauthNotice({
        kind: "error",
        message: `${platform || "Integration"} connection was not completed. Try again or check the provider account.`,
      });
    }
    if (connected || error) {
      const cleanUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  const fetchStatus = useCallback(
    async (cid: string) => {
      setLoading(true);
      setIntegrationError(null);
      try {
        if (!workspaceSlug || !communityId || !actorPubkey) return;
        const data = await getGrowthWorkspaceIntegrations(cid, {
          envelope: {
            correlationId: `growth-integrations:${workspaceSlug}`,
            idempotencyKey: `growth-integrations-read:${workspaceSlug}`,
            workspaceSlug,
            relayCommunityId: communityId,
            actorPubkey,
            companyId: cid,
          },
        });
        const map: Record<string, GrowthWorkspaceIntegration> = {};
        for (const item of data) map[item.platform] = item;
        setIntegrations(map);
      } catch (cause) {
        setIntegrationError(
          cause instanceof Error
            ? cause.message
            : "Integration status unavailable.",
        );
      } finally {
        setLoading(false);
      }
    },
    [actorPubkey, communityId, workspaceSlug],
  );

  useEffect(() => {
    getCurrentPubkey()
      .then(setActorPubkey)
      .catch(() => {});
    const cid = workspaceSlug
      ? (localStorage.getItem(growthCompanyStorageKey(workspaceSlug)) ?? "")
      : "";
    setCompanyId(cid);
    if (cid) {
      fetchStatus(cid);
    }
  }, [fetchStatus, workspaceSlug]);

  const handleConnect = (platform: string) => {
    const correlationId = `growth-integration-connect:${platform}`;
    const idempotencyKey = `growth-integration-connect:${companyId}:${platform}:${Date.now()}`;
    if (!workspaceSlug || !communityId || !actorPubkey) return;
    window.open(
      growthWorkspaceIntegrationConnectUrl(companyId, platform, {
        envelope: {
          correlationId,
          idempotencyKey,
          workspaceSlug,
          relayCommunityId: communityId,
          actorPubkey,
          companyId,
        },
      }),
      "_blank",
    );
  };

  const handleDisconnect = async (platform: string) => {
    if (!workspaceSlug || !communityId || !actorPubkey) return;
    try {
      setIntegrationError(null);
      await disconnectGrowthWorkspaceIntegration(companyId, platform, {
        envelope: {
          correlationId: `growth-integration-disconnect:${platform}`,
          idempotencyKey: `growth-integration-disconnect:${companyId}:${platform}`,
          workspaceSlug,
          relayCommunityId: communityId,
          actorPubkey,
          companyId,
        },
      });
      setOauthNotice(null);
      await fetchStatus(companyId);
    } catch (cause) {
      setIntegrationError(
        cause instanceof Error ? cause.message : "Disconnect failed.",
      );
    }
  };

  return (
    <div className="max-w-md">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Integrations
      </p>
      <p className="mb-5 text-xs text-black/50 dark:text-white/50">
        Connect tools for Len to use in your workspace.
      </p>

      {!companyId ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Connect LenGrowth first in Settings → LenGrowth
        </p>
      ) : loading ? (
        <p className="text-sm text-black/40 dark:text-white/40">Loading…</p>
      ) : (
        <>
          {oauthNotice && (
            <div
              role="status"
              className={`mb-3 rounded-md border p-3 text-xs ${
                oauthNotice.kind === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200"
              }`}
            >
              {oauthNotice.message}
            </div>
          )}
          {integrationError && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <span>{integrationError}</span>
              <button
                type="button"
                onClick={() => void fetchStatus(companyId)}
                className="rounded border border-current px-2 py-1 font-medium"
              >
                Retry status
              </button>
            </div>
          )}
          <div className="space-y-2">
            {PLATFORMS.map((p) => {
              const integration = integrations[p.id];
              const connected = integration?.connected ?? false;
              const health = integration ? syncHealth(integration) : null;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-black/15 px-4 py-3 dark:border-white/15"
                >
                  <span className="text-sm font-medium text-black dark:text-white">
                    {p.label}
                  </span>
                  <div className="flex items-center gap-3">
                    {integration?.connected_at && (
                      <span className="text-xs text-black/45 dark:text-white/45">
                        Connected{" "}
                        {new Date(
                          integration.connected_at,
                        ).toLocaleDateString()}
                      </span>
                    )}
                    {integration && (
                      <span className="text-xs capitalize text-black/45 dark:text-white/45">
                        {integration.sync_status?.replace(/_/g, " ") ??
                          "status unavailable"}
                      </span>
                    )}
                    {integration?.last_sync_at && (
                      <span className="text-xs text-black/45 dark:text-white/45">
                        Synced{" "}
                        {new Date(
                          integration.last_sync_at,
                        ).toLocaleDateString()}
                      </span>
                    )}
                    {integration?.token_expiry &&
                      Number.isFinite(Date.parse(integration.token_expiry)) && (
                        <span className="hidden text-xs text-black/45 dark:text-white/45 lg:inline">
                          Token{" "}
                          {new Date(
                            integration.token_expiry,
                          ).toLocaleDateString()}
                        </span>
                      )}
                    {health && (
                      <span
                        className={`text-xs font-medium ${health.className}`}
                      >
                        {health.label}
                      </span>
                    )}
                    {integration?.supported_metrics?.length ? (
                      <span
                        className="hidden text-xs text-black/45 dark:text-white/45 sm:inline"
                        title="Metrics available from this integration"
                      >
                        {integration.supported_metrics.join(", ")}
                      </span>
                    ) : null}
                    {integration?.scopes?.length ? (
                      <span
                        className="hidden text-xs text-black/45 dark:text-white/45 md:inline"
                        title="Granted provider scopes"
                      >
                        {integration.scopes.length} scopes
                      </span>
                    ) : null}
                    {integration?.scope_status === "reduced" && (
                      <span className="text-xs font-medium text-red-700 dark:text-red-300">
                        Access reduced
                      </span>
                    )}
                    {connected && health && health.label !== "Sync healthy" && (
                      <button
                        type="button"
                        onClick={() => handleConnect(p.id)}
                        className="rounded-md border border-amber-700/40 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:border-amber-300/40 dark:text-amber-200 dark:hover:bg-amber-950/30"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        connected ? handleDisconnect(p.id) : handleConnect(p.id)
                      }
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        connected
                          ? "bg-black/[0.08] text-black hover:bg-black/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                          : "bg-black text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
                      }`}
                    >
                      {connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                  {integration?.last_error && (
                    <p className="mt-1 text-right text-xs text-red-700 dark:text-red-300">
                      {integration.last_error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <WebhooksSection />
    </div>
  );
}

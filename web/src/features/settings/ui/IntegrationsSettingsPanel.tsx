import { useCallback, useEffect, useState } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { relayHttpUrl, relayWsUrl } from "@/shared/lib/relay-url";
import { makeNip98AuthHeader } from "@/shared/lib/nip98";

const LENGROWTH_API = "https://growth-api.lenquant.com";

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
                  <p className="mt-0.5 font-mono text-xs text-black/40 dark:text-white/40">
                    secret: {wh.secret.slice(0, 8)}…
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
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");

  const fetchStatus = useCallback(async (cid: string) => {
    const token = localStorage.getItem("lenos_managed_signer_token");
    setLoading(true);
    try {
      const res = await fetch(
        `${LENGROWTH_API}/api/workspace/integrations/status?company_id=${cid}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data: { platform: string; connected: boolean }[] =
          await res.json();
        const map: Record<string, boolean> = {};
        for (const item of data) {
          map[item.platform] = item.connected;
        }
        setIntegrations(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cid = localStorage.getItem("lengrowth-company-id") ?? "";
    setCompanyId(cid);
    if (cid) {
      fetchStatus(cid);
    }
  }, [fetchStatus]);

  const handleConnect = (platform: string) => {
    window.open(
      `${LENGROWTH_API}/api/workspace/integrations/${platform}/connect?company_id=${companyId}`,
      "_blank",
    );
  };

  const handleDisconnect = async (platform: string) => {
    const token = localStorage.getItem("lenos_managed_signer_token");
    await fetch(
      `${LENGROWTH_API}/api/workspace/integrations/${platform}?company_id=${companyId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    fetchStatus(companyId);
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
        <div className="space-y-2">
          {PLATFORMS.map((p) => {
            const connected = integrations[p.id] ?? false;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-black/15 px-4 py-3 dark:border-white/15"
              >
                <span className="text-sm font-medium text-black dark:text-white">
                  {p.label}
                </span>
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
            );
          })}
        </div>
      )}

      <WebhooksSection />
    </div>
  );
}

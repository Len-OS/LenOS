import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCommunities } from "@/features/communities/useCommunities";
import type { SettingsPanelProps } from "./SettingsPanels";

const LENGROWTH_BASE =
  import.meta.env.VITE_LENGROWTH_URL ?? "https://lengrowth.com";

const INTEGRATION_PLATFORMS = [
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "linear", label: "Linear" },
  { id: "slack", label: "Slack" },
];

interface Cron {
  cron_id: string;
  prompt: string;
  schedule: string;
  timezone: string;
  run_count: number;
  next_run_at: string | null;
}

function buildConnectUrl(pubkey: string, relayUrl: string): string {
  const state = crypto.randomUUID().replace(/-/g, "");
  return `${LENGROWTH_BASE}/auth/nostr-link?${new URLSearchParams({ pubkey, relay: relayUrl, state })}`;
}

export function LenGrowthSettingsPanel(props: SettingsPanelProps) {
  const [connected, setConnected] = useState<boolean>(
    () => localStorage.getItem("lengrowth-linked") === "true",
  );
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [companyId, setCompanyId] = useState<string>(
    () => localStorage.getItem("lengrowth-company-id") ?? "",
  );
  const [crons, setCrons] = useState<Cron[]>([]);

  const { activeCommunity } = useCommunities();
  const relayUrl = activeCommunity?.relayUrl ?? "";
  const pubkey = props.currentPubkey ?? "";

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen(
      "deep-link-lengrowth-auth",
      (event: { payload: { linked?: boolean } }) => {
        if (event.payload?.linked) {
          setConnected(true);
          localStorage.setItem("lengrowth-linked", "true");
        }
      },
    ).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    const token = localStorage.getItem("lengrowth-token");
    const cid = localStorage.getItem("lengrowth-company-id") ?? "";
    setCompanyId(cid);
    fetch(
      `${LENGROWTH_BASE}/api/workspace/integrations/status?company_id=${cid}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then((r) => r.json())
      .then((data: { platform: string; connected: boolean }[]) => {
        const map: Record<string, boolean> = {};
        for (const item of data) map[item.platform] = item.connected;
        setIntegrations(map);
      })
      .catch(() => {});
    fetch(`${LENGROWTH_BASE}/api/agent/crons?company_id=${cid}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: Cron[]) => setCrons(data))
      .catch(() => {});
  }, [connected]);

  function handleConnectIntegration(platform: string) {
    openUrl(
      `${LENGROWTH_BASE}/api/workspace/integrations/${platform}/connect?company_id=${companyId}`,
    );
  }

  function handleDeleteCron(cronId: string) {
    const token = localStorage.getItem("lengrowth-token");
    fetch(
      `${LENGROWTH_BASE}/api/agent/crons/${cronId}?company_id=${companyId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => {});
    setCrons((prev) => prev.filter((c) => c.cron_id !== cronId));
  }

  function handleDisconnectIntegration(platform: string) {
    const token = localStorage.getItem("lengrowth-token");
    fetch(
      `${LENGROWTH_BASE}/api/workspace/integrations/${platform}?company_id=${companyId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    )
      .catch(() => {})
      .finally(() => {
        setIntegrations((prev) => ({ ...prev, [platform]: false }));
      });
  }

  function handleConnect() {
    if (!pubkey || !relayUrl) return;
    openUrl(buildConnectUrl(pubkey, relayUrl));
  }

  function handleDisconnect() {
    setConnected(false);
    localStorage.removeItem("lengrowth-linked");
    if (pubkey) {
      fetch(`${LENGROWTH_BASE}/api/auth/nostr-link?nostr_pubkey=${pubkey}`, {
        method: "DELETE",
      }).catch(() => {});
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="text-lg font-semibold">LenGrowth</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your LenGrowth account to orchestrate growth tasks from LenOS.
        </p>
      </div>

      {connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-600">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            LenGrowth connected
          </div>
          <p className="text-sm text-muted-foreground">
            Use{" "}
            <code className="text-xs bg-muted px-1 rounded">@lengrowth</code> in
            the LenGrowth HQ channel to create tasks, trigger agents, and query
            metrics.
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            className="text-sm text-destructive underline underline-offset-2"
          >
            Disconnect LenGrowth
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Not connected. Link your LenGrowth account to get started.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            disabled={!pubkey || !relayUrl}
          >
            Connect LenGrowth
          </button>
        </div>
      )}

      {connected && crons.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Automations</h3>
          <div className="space-y-2">
            {crons.map((c) => (
              <div
                key={c.cron_id}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex-1 line-clamp-2">{c.prompt}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteCron(c.cron_id)}
                    className="text-xs text-destructive underline underline-offset-2 shrink-0 mt-0.5"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {c.schedule} · {c.timezone} · ran {c.run_count}×
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {connected && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Workspace Integrations</h3>
          <div className="space-y-2">
            {INTEGRATION_PLATFORMS.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>{p.label}</span>
                {integrations[p.id] ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnectIntegration(p.id)}
                    className="text-xs text-destructive underline underline-offset-2"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnectIntegration(p.id)}
                    disabled={!companyId}
                    className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    Connect
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

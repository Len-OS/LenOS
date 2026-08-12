import { useEffect, useState } from "react";

const LENGROWTH_API = "https://growth-api.lenquant.com";

const PLATFORMS = [
  { id: "github", label: "GitHub" },
  { id: "notion", label: "Notion" },
  { id: "linear", label: "Linear" },
  { id: "slack", label: "Slack" },
];

export function IntegrationsSettingsPanel() {
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");

  const fetchStatus = async (cid: string) => {
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
  };

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
    </div>
  );
}

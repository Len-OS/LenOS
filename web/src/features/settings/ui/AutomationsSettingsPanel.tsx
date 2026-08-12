import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

const LENGROWTH_API = "https://growth-api.lenquant.com";
const getToken = () => localStorage.getItem("lenos_managed_signer_token");

interface Cron {
  cron_id: string;
  prompt: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
}

export function AutomationsSettingsPanel() {
  const [crons, setCrons] = useState<Cron[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");

  const fetchCrons = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${LENGROWTH_API}/api/agent/crons?company_id=${cid}`,
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      if (res.ok) setCrons(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cid = localStorage.getItem("lengrowth-company-id") ?? "";
    setCompanyId(cid);
    if (cid) fetchCrons(cid);
  }, [fetchCrons]);

  const handleDelete = async (cronId: string) => {
    await fetch(
      `${LENGROWTH_API}/api/agent/crons/${cronId}?company_id=${companyId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } },
    );
    setCrons((prev) => prev.filter((c) => c.cron_id !== cronId));
  };

  return (
    <div className="max-w-md">
      <p className="mb-1 text-sm font-semibold text-black dark:text-white">
        Automations
      </p>
      <p className="mb-5 text-xs text-black/50 dark:text-white/50">
        Recurring tasks created by Len. Cancel them here or by asking Len to
        stop them.
      </p>

      {!companyId ? (
        <p className="text-sm text-black/50 dark:text-white/50">
          Connect LenGrowth first in Settings → LenGrowth
        </p>
      ) : loading ? (
        <p className="text-sm text-black/40 dark:text-white/40">Loading…</p>
      ) : crons.length === 0 ? (
        <p className="text-sm text-black/40 dark:text-white/40">
          No active automations. Ask Len to create one: "Send me a standup every
          morning at 8am."
        </p>
      ) : (
        <div className="space-y-2">
          {crons.map((c) => (
            <div
              key={c.cron_id}
              className="rounded-lg border border-black/15 px-4 py-3 dark:border-white/15"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-black dark:text-white line-clamp-2 flex-1">
                  {c.prompt}
                </p>
                <button
                  type="button"
                  onClick={() => handleDelete(c.cron_id)}
                  className="mt-0.5 shrink-0 text-black/30 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400"
                  aria-label="Cancel automation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                {c.schedule} · {c.timezone} · ran {c.run_count}×
                {c.next_run_at
                  ? ` · next ${new Date(c.next_run_at).toLocaleString()}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

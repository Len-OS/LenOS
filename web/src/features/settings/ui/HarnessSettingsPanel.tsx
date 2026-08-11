import { useCallback, useEffect, useState } from "react";
import { Cpu, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";

const LENGROWTH_API = "https://growth-api.lenquant.com";

type ConnectionStatus = "idle" | "checking" | "connected" | "disconnected";

const MODEL_TIERS = [
  {
    label: "Default",
    model: "claude-sonnet-5",
    desc: "Balanced speed and capability",
  },
  {
    label: "Fast",
    model: "claude-haiku-4-5",
    desc: "Quick tasks and short responses",
  },
  {
    label: "Powerful",
    model: "claude-opus-5",
    desc: "Complex reasoning and long tasks",
  },
] as const;

export function HarnessSettingsPanel() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [companyId, setCompanyId] = useState("");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  useEffect(() => {
    const cid = localStorage.getItem("lengrowth-company-id") ?? "";
    setCompanyId(cid);
  }, []);

  const checkConnection = useCallback(async () => {
    setStatus("checking");
    try {
      const token = localStorage.getItem("lenos_managed_signer_token");
      const res = await fetch(`${LENGROWTH_API}/api/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      setStatus(res.ok ? "connected" : "disconnected");
    } catch {
      setStatus("disconnected");
    }
    setLastChecked(
      new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">
          Agent Harness
        </h3>
        <p className="mt-1 text-xs text-black/50 dark:text-white/50">
          Runtime configuration for the LenOS agent backend.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="flex items-start gap-3">
            <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-black/40 dark:text-white/40" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-black/70 dark:text-white/70">
                LenGrowth Backend
              </p>
              <p className="mt-0.5 break-all font-mono text-xs text-black/40 dark:text-white/40">
                {LENGROWTH_API}
              </p>
              {companyId && (
                <p className="mt-0.5 text-xs text-black/40 dark:text-white/40">
                  Company:{" "}
                  <span className="font-mono">{companyId.slice(0, 8)}…</span>
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {status === "checking" && (
                <RefreshCw className="h-4 w-4 animate-spin text-black/40 dark:text-white/40" />
              )}
              {status === "connected" && (
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              )}
              {status === "disconnected" && (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span className="text-xs text-black/40 dark:text-white/40">
                {status === "checking"
                  ? "Checking…"
                  : status === "connected"
                    ? "Connected"
                    : status === "disconnected"
                      ? "Unreachable"
                      : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void checkConnection()}
            disabled={status === "checking"}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${status === "checking" ? "animate-spin" : ""}`}
            />
            Check connection
          </Button>
          {lastChecked && (
            <span className="text-xs text-black/30 dark:text-white/30">
              Last checked: {lastChecked}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-black/30 dark:text-white/30">
          Model Routing
        </p>
        <div className="space-y-2">
          {MODEL_TIERS.map((tier) => (
            <div
              key={tier.model}
              className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2.5 dark:border-white/10"
            >
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  {tier.label}
                </p>
                <p className="text-xs text-black/40 dark:text-white/40">
                  {tier.desc}
                </p>
              </div>
              <span className="font-mono text-xs text-black/40 dark:text-white/40">
                {tier.model}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-black/30 dark:text-white/30">
          Routing is managed by the LenGrowth backend. Change model defaults in
          Settings → Agents.
        </p>
      </div>
    </div>
  );
}

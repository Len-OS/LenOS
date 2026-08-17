import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { PROVIDER_CREDENTIAL_CONFIG } from "../lib/providerCredentialConfig";
import { loadCredentialKeys, getEncryptionKey } from "../lib/credentialApi";

type ReadinessState =
  | { status: "loading" }
  | { status: "no_key" }
  | { status: "ready" }
  | { status: "missing"; missingKeys: string[] };

interface Props {
  agentDTag: string;
  onConfigure?: () => void;
}

export function AgentReadinessBadge({ agentDTag, onConfigure }: Props) {
  const [readiness, setReadiness] = useState<ReadinessState>({ status: "loading" });

  useEffect(() => {
    if (!getEncryptionKey()) {
      setReadiness({ status: "no_key" });
      return;
    }

    setReadiness({ status: "loading" });
    loadCredentialKeys(agentDTag)
      .then((keys) => {
        if (!keys) {
          setReadiness({ status: "missing", missingKeys: [] });
          return;
        }
        const provider = keys["LENOS_AGENT_PROVIDER"];
        if (!provider || !PROVIDER_CREDENTIAL_CONFIG[provider]) {
          setReadiness({ status: "missing", missingKeys: ["LENOS_AGENT_PROVIDER"] });
          return;
        }
        const cfg = PROVIDER_CREDENTIAL_CONFIG[provider];
        const missingKeys = cfg.requiredEnvKeys.filter((k) => !keys[k]);
        if (missingKeys.length > 0) {
          setReadiness({ status: "missing", missingKeys });
        } else {
          setReadiness({ status: "ready" });
        }
      })
      .catch(() => {
        setReadiness({ status: "no_key" });
      });
  }, [agentDTag]);

  if (readiness.status === "loading" || readiness.status === "no_key") {
    return null;
  }

  if (readiness.status === "ready") {
    return (
      <span className="flex w-fit items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="h-3 w-3" />
        Ready
      </span>
    );
  }

  const label =
    readiness.missingKeys.length > 0
      ? `Missing: ${readiness.missingKeys.slice(0, 2).join(", ")}${readiness.missingKeys.length > 2 ? "…" : ""}`
      : "No credentials configured";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onConfigure?.();
      }}
      className="flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50"
    >
      <AlertTriangle className="h-3 w-3" />
      {label}
    </button>
  );
}

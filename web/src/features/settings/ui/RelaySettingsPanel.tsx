import { useState, useEffect } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

type ConnStatus = "connected" | "disconnected";

function probeStatus(): ConnStatus {
  try {
    const client = getRelayClient(relayWsUrl());
    return client.isAuthenticated() ? "connected" : "disconnected";
  } catch {
    return "disconnected";
  }
}

export function RelaySettingsPanel() {
  const [status, setStatus] = useState<ConnStatus>("disconnected");

  useEffect(() => {
    setStatus(probeStatus());
    const id = setInterval(() => setStatus(probeStatus()), 3_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-lg border border-black/15 px-4 py-3 dark:border-white/15">
        <p className="mb-1 text-sm font-medium text-black dark:text-white">
          Workspace connection
        </p>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${status === "connected" ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-xs text-black/60 dark:text-white/60">
            {status === "connected" ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>
      <p className="text-sm leading-6 text-black/60 dark:text-white/60">
        LenOS keeps this connection ready automatically. There is nothing else
        you need to configure.
      </p>
    </div>
  );
}

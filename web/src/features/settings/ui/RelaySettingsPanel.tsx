import { useState, useEffect } from "react";
import { getRelayClient } from "@/shared/lib/relay-live-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

type ConnStatus = "connected" | "disconnected";

function probeStatus(): ConnStatus {
  try {
    const client = getRelayClient(relayWsUrl());
    const unsub = client.subscribe({
      id: "__status_probe__",
      filter: { kinds: [0], limit: 0 },
      onEvent: () => {},
    });
    unsub();
    return "connected";
  } catch {
    return "disconnected";
  }
}

export function RelaySettingsPanel() {
  const defaultUrl = relayWsUrl();
  const [customUrl, setCustomUrl] = useState(
    () => localStorage.getItem("lenos_relay_url") ?? defaultUrl,
  );
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<ConnStatus>("connected");

  useEffect(() => {
    setStatus(probeStatus());
    const id = setInterval(() => setStatus(probeStatus()), 3_000);
    return () => clearInterval(id);
  }, []);

  const saveUrl = () => {
    localStorage.setItem("lenos_relay_url", customUrl.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      window.location.reload();
    }, 800);
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="rounded-lg border border-black/15 px-4 py-3 dark:border-white/15">
        <p className="mb-1 text-sm font-medium text-black dark:text-white">
          Relay
        </p>
        <p className="mb-3 truncate text-xs text-black/40 dark:text-white/40">
          {defaultUrl}
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

      <div>
        <p className="mb-2 text-sm font-medium text-black/70 dark:text-white/70">
          Custom relay URL
        </p>
        <input
          type="text"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="wss://relay.example.com"
          className="mb-3 w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-black/30 dark:border-white/15 dark:text-white dark:focus:border-white/30"
        />
        <button
          type="button"
          onClick={saveUrl}
          disabled={!customUrl.trim()}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/80"
        >
          {saved ? "Saved — reloading…" : "Save & reconnect"}
        </button>
      </div>
    </div>
  );
}

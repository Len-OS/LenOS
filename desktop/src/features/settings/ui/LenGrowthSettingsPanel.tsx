import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCommunities } from "@/features/communities/useCommunities";
import type { SettingsPanelProps } from "./SettingsPanels";

const LENGROWTH_BASE = import.meta.env.VITE_LENGROWTH_URL ?? "https://lengrowth.com";

function buildConnectUrl(pubkey: string, relayUrl: string): string {
  const state = crypto.randomUUID().replace(/-/g, "");
  return `${LENGROWTH_BASE}/auth/nostr-link?${new URLSearchParams({ pubkey, relay: relayUrl, state })}`;
}

export function LenGrowthSettingsPanel(props: SettingsPanelProps) {
  const [connected, setConnected] = useState<boolean>(
    () => localStorage.getItem("lengrowth-linked") === "true"
  );

  const { activeCommunity } = useCommunities();
  const relayUrl = activeCommunity?.relayUrl ?? "";
  const pubkey = props.currentPubkey ?? "";

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("deep-link-lengrowth-auth", (event: { payload: { linked?: boolean } }) => {
      if (event.payload?.linked) {
        setConnected(true);
        localStorage.setItem("lengrowth-linked", "true");
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

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
            Use <code className="text-xs bg-muted px-1 rounded">@lengrowth</code> in
            the LenGrowth HQ channel to create tasks, trigger agents, and query metrics.
          </p>
          <button
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
            onClick={handleConnect}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            disabled={!pubkey || !relayUrl}
          >
            Connect LenGrowth
          </button>
        </div>
      )}
    </div>
  );
}

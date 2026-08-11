import { useState } from "react";
import { Link, ShieldCheck, X, Loader2 } from "lucide-react";
import { nip19 } from "nostr-tools";
import { Button } from "@/shared/ui/button";
import {
  getCurrentPubkey,
  setManagedSignerSession,
  hasNip07Provider,
} from "@/shared/lib/nostr-signer";

const LENGROWTH_API = "https://growth-api.lenquant.com";

interface Props {
  onClose: () => void;
  onBound?: () => void;
}

type Stage = "confirm" | "linking" | "done" | "error";

export function NostrBindDialog({ onClose, onBound }: Props) {
  const [stage, setStage] = useState<Stage>("confirm");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const npub = pubkey
    ? (() => {
        try {
          return nip19.npubEncode(pubkey);
        } catch {
          return pubkey;
        }
      })()
    : null;

  const handleBind = async () => {
    setStage("linking");
    setErrorMsg("");
    try {
      if (!hasNip07Provider()) {
        throw new Error(
          "A NIP-07 browser extension is required to bind a Nostr identity.",
        );
      }

      const pk = await getCurrentPubkey();
      if (!pk) throw new Error("Could not read public key from extension.");
      setPubkey(pk);

      const response = await fetch(
        `${LENGROWTH_API}/api/auth/managed-nostr/bind`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey: pk }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          payload?.detail ?? "The LenGrowth server rejected the bind request.",
        );
      }

      const payload = (await response.json()) as {
        token?: string;
        pubkey?: string;
      };
      if (!payload.token || !payload.pubkey) {
        throw new Error("Server returned an unexpected response.");
      }

      setManagedSignerSession(payload.token, payload.pubkey);
      setStage("done");
      onBound?.();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Bind failed.");
      setStage("error");
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      onKeyDown={() => {}}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link Nostr identity"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link className="h-4 w-4 text-black/40 dark:text-white/40" />
            <h2 className="text-base font-semibold text-black dark:text-white">
              Link Nostr identity
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-black/40 hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "confirm" && (
          <>
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-black/40 dark:text-white/40" />
                <div>
                  <p className="text-sm font-medium text-black/80 dark:text-white/80">
                    What this does
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs text-black/60 dark:text-white/60">
                    <li>• Reads your public key from your NIP-07 extension</li>
                    <li>
                      • Registers it with LenGrowth so events can be signed on
                      your behalf
                    </li>
                    <li>• Your private key never leaves your extension</li>
                    <li>
                      • You can unlink at any time from Settings → Workspace
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void handleBind()}>
                Link identity
              </Button>
            </div>
          </>
        )}

        {stage === "linking" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 animate-spin text-black/30 dark:text-white/30" />
            <p className="text-sm text-black/60 dark:text-white/60">
              Linking identity…
            </p>
          </div>
        )}

        {stage === "done" && (
          <>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-black dark:text-white">
                Identity linked
              </p>
              {npub && (
                <p className="break-all font-mono text-[10px] text-black/40 dark:text-white/40">
                  {npub.slice(0, 20)}…{npub.slice(-8)}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}

        {stage === "error" && (
          <>
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Failed to link identity
              </p>
              <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
                {errorMsg}
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setStage("confirm");
                  setErrorMsg("");
                }}
              >
                Try again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Sparkles, KeyRound, Puzzle, ExternalLink } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { hasNip07Provider } from "@/shared/lib/nostr-signer";

interface Props {
  onComplete: () => void;
  onImportKey: () => void;
}

export function IdentityStep({ onComplete, onImportKey }: Props) {
  const [showExtensionHelp, setShowExtensionHelp] = useState(false);
  const hasExtension = hasNip07Provider();

  const handleExtensionClick = () => {
    if (hasExtension) {
      onComplete();
    } else {
      setShowExtensionHelp(true);
    }
  };

  if (showExtensionHelp) {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/5">
          <Puzzle className="h-7 w-7 text-black/50 dark:text-white/50" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-black dark:text-white">
            Install a browser extension
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-black/50 dark:text-white/50">
            A NIP-07 extension manages your Nostr key securely. Install one,
            then come back and refresh this page.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.02] dark:text-white dark:hover:bg-white/[0.06]"
          >
            Alby (recommended)
            <ExternalLink className="h-4 w-4 opacity-50" />
          </a>
          <a
            href="https://github.com/fiatjaf/nos2x"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.02] dark:text-white dark:hover:bg-white/[0.06]"
          >
            nos2x
            <ExternalLink className="h-4 w-4 opacity-50" />
          </a>
          <Button
            variant="ghost"
            className="text-sm text-black/40 dark:text-white/40"
            onClick={() => setShowExtensionHelp(false)}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-black dark:text-white">
          Connect your identity
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-black/50 dark:text-white/50">
          LenOS uses a Nostr identity for workspace membership. Choose how to
          connect.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={onComplete}
          className="flex flex-col items-start rounded-xl border border-black/10 bg-black/[0.02] p-4 text-left transition-colors hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-black dark:text-white">
              Create a new identity
            </span>
          </div>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            Generate a key now and back it up with a password. No extension
            needed.
          </p>
        </button>

        <button
          type="button"
          onClick={onImportKey}
          className="flex flex-col items-start rounded-xl border border-black/10 bg-black/[0.02] p-4 text-left transition-colors hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-black/70 dark:text-white/70" />
            <span className="text-sm font-semibold text-black dark:text-white">
              I have a Nostr key
            </span>
          </div>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            Paste your nsec or drop an encrypted backup file.
          </p>
        </button>

        <button
          type="button"
          onClick={handleExtensionClick}
          className="flex flex-col items-start rounded-xl border border-black/10 bg-black/[0.02] p-4 text-left transition-colors hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.06]"
        >
          <div className="flex items-center gap-2">
            <Puzzle className="h-5 w-5 text-black/70 dark:text-white/70" />
            <span className="text-sm font-semibold text-black dark:text-white">
              Browser extension (NIP-07)
              {hasExtension && (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  Detected
                </span>
              )}
            </span>
          </div>
          <p className="mt-1 text-xs text-black/50 dark:text-white/50">
            {hasExtension
              ? "Alby or nos2x detected. Click to continue."
              : "Use Alby, nos2x, or another NIP-07 extension."}
          </p>
        </button>
      </div>
    </div>
  );
}
